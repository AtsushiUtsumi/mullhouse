"""Range evaluation solver engine."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from hand_eval import (
    categorize_hand_strength,
    expand_range,
    monte_carlo_equity,
    nut_rank_on_board,
    parse_board,
)

BET_SIZES = {
    "b33": 0.33,
    "b50": 0.50,
    "b60": 0.60,
    "b75": 0.75,
    "b100": 1.00,
    "x": 0.0,
}

POT_SIZE = 100.0  # normalized pot in big blinds


def line_to_filename(line: list[str]) -> str:
    return "_".join(line) + ".json"


def filename_to_line(filename: str) -> list[str]:
    name = filename.replace(".json", "")
    return name.split("_")


def validate_range_data(data: dict[str, Any]) -> None:
    required = ["position", "board", "line", "hero_range", "villain_range"]
    for key in required:
        if key not in data:
            raise ValueError(f"Missing required field: {key}")
    if len(data["board"]) != 10:
        raise ValueError("Board must be 5 cards (10 characters)")
    cards = [data["board"][i : i + 2] for i in range(0, 10, 2)]
    for c in cards:
        if not re.match(r"^[2-9TJQKA][cdhs]$", c, re.IGNORECASE):
            raise ValueError(f"Invalid card in board: {c}")
    if len({c.lower() for c in cards}) != 5:
        raise ValueError("Board cards must be unique")


def get_range_path(base_dir: Path, position: str, board: str, line: list[str]) -> Path:
    return base_dir / position / board / line_to_filename(line)


def save_range(base_dir: Path, data: dict[str, Any]) -> Path:
    validate_range_data(data)
    path = get_range_path(base_dir, data["position"], data["board"], data["line"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return path


def load_range(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    validate_range_data(data)
    return data


def list_ranges(base_dir: Path) -> list[dict[str, str]]:
    results = []
    if not base_dir.exists():
        return results
    for pos_dir in sorted(base_dir.iterdir()):
        if not pos_dir.is_dir():
            continue
        for board_dir in sorted(pos_dir.iterdir()):
            if not board_dir.is_dir():
                continue
            for json_file in sorted(board_dir.glob("*.json")):
                results.append(
                    {
                        "position": pos_dir.name,
                        "board": board_dir.name,
                        "line": filename_to_line(json_file.name),
                        "path": str(json_file.relative_to(base_dir)),
                    }
                )
    return results


def _last_bet_size(line: list[str]) -> float:
    for action in reversed(line):
        if action.startswith("flop_") or action.startswith("turn_") or action.startswith("river_"):
            part = action.split("_", 1)[1]
            if part in BET_SIZES:
                return BET_SIZES[part]
    return 0.33


def _recommended_action(equity: float, value_ratio: float, line: list[str]) -> str:
    last_street = line[-1] if line else "river_b33"
    street_prefix = last_street.split("_")[0]

    if equity >= 0.58:
        if value_ratio >= 0.65:
            return f"{street_prefix}_b75"
        return f"{street_prefix}_b60"
    if equity >= 0.52:
        return f"{street_prefix}_b33"
    if equity >= 0.48:
        return f"{street_prefix}_x"
    if equity >= 0.40:
        return f"{street_prefix}_b33"  # bluff
    return f"{street_prefix}_x"


def solve_range(data: dict[str, Any], iterations: int = 3000) -> dict[str, Any]:
    """Evaluate a range configuration and return solver output."""
    validate_range_data(data)
    board = parse_board(data["board"])
    board_set = {data["board"][i : i + 2] for i in range(0, 10, 2)}

    hero_combos = expand_range(data["hero_range"], board_set)
    villain_combos = expand_range(data["villain_range"], board_set)

    equity = monte_carlo_equity(hero_combos, villain_combos, board, iterations=iterations)

    hero_nut_sum = 0.0
    hero_weight = 0.0
    villain_nut_sum = 0.0
    villain_weight = 0.0

    value_combos = 0.0
    bluff_combos = 0.0
    total_hero_combos = 0.0

    for hole, freq in hero_combos:
        nut = nut_rank_on_board(hole, board)
        hero_nut_sum += nut * freq
        hero_weight += freq
        cat = categorize_hand_strength(hole, board)
        total_hero_combos += freq
        if cat == "value":
            value_combos += freq
        elif cat == "bluff":
            bluff_combos += freq

    for hole, freq in villain_combos:
        nut = nut_rank_on_board(hole, board)
        villain_nut_sum += nut * freq
        villain_weight += freq

    hero_nut_adv = (hero_nut_sum / hero_weight) if hero_weight else 0.5
    villain_nut_adv = (villain_nut_sum / villain_weight) if villain_weight else 0.5
    nut_advantage = hero_nut_adv / (hero_nut_adv + villain_nut_adv) if (hero_nut_adv + villain_nut_adv) > 0 else 0.5

    bet_size = _last_bet_size(data["line"])
    pot = POT_SIZE
    bet_amount = pot * bet_size

    # Simplified EV: equity share of pot minus bluff cost
    hero_ev = equity * (pot + bet_amount) - (1 - equity) * bet_amount * 0.3
    villain_ev = -hero_ev

    classified = value_combos + bluff_combos
    if classified > 0:
        value_ratio = value_combos / classified
        bluff_ratio = bluff_combos / classified
    else:
        value_ratio = 0.5
        bluff_ratio = 0.5

    recommended = _recommended_action(equity, value_ratio, data["line"])

    return {
        "hero_ev": round(hero_ev, 2),
        "villain_ev": round(villain_ev, 2),
        "nut_advantage": round(nut_advantage, 2),
        "range_advantage": round(equity, 2),
        "value_ratio": round(value_ratio, 2),
        "bluff_ratio": round(bluff_ratio, 2),
        "recommended_action": recommended,
        "hero_equity": round(equity, 4),
    }


def solve_from_file(path: Path, iterations: int = 3000) -> dict[str, Any]:
    data = load_range(path)
    result = solve_range(data, iterations=iterations)
    result["source"] = str(path)
    return result
