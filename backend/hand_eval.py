"""Poker hand evaluation utilities."""

from __future__ import annotations

import itertools
import random
from dataclasses import dataclass
from typing import Iterable

RANKS = "23456789TJQKA"
RANK_VALUE = {r: i for i, r in enumerate(RANKS)}
SUITS = "cdhs"

HAND_RANK_NAMES = [
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
]


@dataclass(frozen=True)
class Card:
    rank: str
    suit: str

    @classmethod
    def from_str(cls, s: str) -> "Card":
        return cls(rank=s[0].upper(), suit=s[1].lower())

    def __str__(self) -> str:
        return f"{self.rank}{self.suit}"


def parse_board(board_str: str) -> list[Card]:
    board_str = board_str.strip()
    if len(board_str) % 2 != 0:
        raise ValueError(f"Invalid board string: {board_str}")
    return [Card.from_str(board_str[i : i + 2]) for i in range(0, len(board_str), 2)]


def parse_hand_notation(hand: str) -> list[tuple[Card, Card]]:
    """Expand hand notation (e.g. AKs, AKo, AA) into combo pairs."""
    hand = hand.strip()
    if len(hand) == 2:
        r1, r2 = hand[0], hand[1]
        if r1 != r2:
            raise ValueError(f"Invalid pair notation: {hand}")
        combos = []
        for s1, s2 in itertools.combinations(SUITS, 2):
            combos.append((Card(r1, s1), Card(r2, s2)))
        return combos
    if len(hand) == 3:
        r1, r2, suited = hand[0], hand[1], hand[2].lower()
        if suited == "s":
            return [(Card(r1, s), Card(r2, s)) for s in SUITS]
        if suited == "o":
            combos = []
            for s1 in SUITS:
                for s2 in SUITS:
                    if s1 != s2:
                        combos.append((Card(r1, s1), Card(r2, s2)))
            return combos
    raise ValueError(f"Invalid hand notation: {hand}")


def expand_range(range_dict: dict[str, float], dead_cards: set[str] | None = None) -> list[tuple[tuple[Card, Card], float]]:
    """Expand range dict into weighted combos, excluding dead cards."""
    dead = dead_cards or set()
    weighted: list[tuple[tuple[Card, Card], float]] = []
    for hand, freq in range_dict.items():
        if freq <= 0:
            continue
        for c1, c2 in parse_hand_notation(hand):
            if str(c1) in dead or str(c2) in dead:
                continue
            weighted.append(((c1, c2), freq))
    return weighted


def _evaluate_five(cards: list[Card]) -> tuple[int, list[int]]:
    """Return (category, tiebreakers) where higher is better."""
    ranks = sorted((RANK_VALUE[c.rank] for c in cards), reverse=True)
    suits = [c.suit for c in cards]
    is_flush = len(set(suits)) == 1

    unique_ranks = sorted(set(ranks), reverse=True)
    rank_counts = {r: ranks.count(r) for r in unique_ranks}
    counts_sorted = sorted(rank_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)

    is_straight = False
    straight_high = ranks[0]
    if len(unique_ranks) == 5:
        if unique_ranks[0] - unique_ranks[4] == 4:
            is_straight = True
            straight_high = unique_ranks[0]
        elif unique_ranks == [12, 3, 2, 1, 0]:  # wheel A-5
            is_straight = True
            straight_high = 3

    if is_straight and is_flush:
        return (8, [straight_high])
    if counts_sorted[0][1] == 4:
        quad = counts_sorted[0][0]
        kicker = counts_sorted[1][0]
        return (7, [quad, kicker])
    if counts_sorted[0][1] == 3 and counts_sorted[1][1] == 2:
        return (6, [counts_sorted[0][0], counts_sorted[1][0]])
    if is_flush:
        return (5, ranks)
    if is_straight:
        return (4, [straight_high])
    if counts_sorted[0][1] == 3:
        kickers = [r for r in ranks if r != counts_sorted[0][0]][:2]
        return (3, [counts_sorted[0][0]] + kickers)
    if counts_sorted[0][1] == 2 and counts_sorted[1][1] == 2:
        high_pair, low_pair = sorted([counts_sorted[0][0], counts_sorted[1][0]], reverse=True)
        kicker = [r for r in ranks if r not in (high_pair, low_pair)][0]
        return (2, [high_pair, low_pair, kicker])
    if counts_sorted[0][1] == 2:
        pair = counts_sorted[0][0]
        kickers = [r for r in ranks if r != pair]
        return (1, [pair] + kickers)
    return (0, ranks)


def evaluate_hand(hole: tuple[Card, Card], board: list[Card]) -> tuple[int, list[int]]:
    """Best 5-card hand from hole + board."""
    all_cards = list(hole) + list(board)
    best: tuple[int, list[int]] | None = None
    for combo in itertools.combinations(all_cards, 5):
        score = _evaluate_five(list(combo))
        if best is None or score > best:
            best = score
    assert best is not None
    return best


def compare_hands(a: tuple[int, list[int]], b: tuple[int, list[int]]) -> int:
    if a[0] != b[0]:
        return 1 if a[0] > b[0] else -1
    for x, y in zip(a[1], b[1]):
        if x != y:
            return 1 if x > y else -1
    return 0


def monte_carlo_equity(
    hero_combos: list[tuple[tuple[Card, Card], float]],
    villain_combos: list[tuple[tuple[Card, Card], float]],
    board: list[Card],
    iterations: int = 3000,
    rng: random.Random | None = None,
) -> float:
    """Return hero equity (0-1) via Monte Carlo simulation."""
    if not hero_combos or not villain_combos:
        return 0.5

    rng = rng or random.Random(42)
    board_set = {str(c) for c in board}
    num_board = len(board)

    hero_weights = [w for _, w in hero_combos]
    villain_weights = [w for _, w in villain_combos]

    hero_wins = 0.0
    villain_wins = 0.0
    ties = 0.0
    total = 0.0

    deck = [Card(r, s) for r in RANKS for s in SUITS if str(Card(r, s)) not in board_set]

    for _ in range(iterations):
        hero_idx = rng.choices(range(len(hero_combos)), weights=hero_weights, k=1)[0]
        villain_idx = rng.choices(range(len(villain_combos)), weights=villain_weights, k=1)[0]
        hero_hole = hero_combos[hero_idx][0]
        villain_hole = villain_combos[villain_idx][0]

        used = board_set | {str(hero_hole[0]), str(hero_hole[1]), str(villain_hole[0]), str(villain_hole[1])}
        available = [c for c in deck if str(c) not in used]

        if num_board >= 5:
            full_board = board[:5]
        else:
            need = 5 - num_board
            if len(available) < need:
                continue
            drawn = rng.sample(available, need)
            full_board = board + drawn

        hero_score = evaluate_hand(hero_hole, full_board)
        villain_score = evaluate_hand(villain_hole, full_board)
        cmp = compare_hands(hero_score, villain_score)
        match_weight = hero_weights[hero_idx] * villain_weights[villain_idx]
        total += match_weight
        if cmp > 0:
            hero_wins += match_weight
        elif cmp < 0:
            villain_wins += match_weight
        else:
            ties += match_weight

    if total == 0:
        return 0.5
    return (hero_wins + ties * 0.5) / total


def nut_rank_on_board(hole: tuple[Card, Card], board: list[Card]) -> float:
    """Normalized nut strength 0-1 on current board."""
    if len(board) < 3:
        return 0.5
    hero_score = evaluate_hand(hole, board)
    all_deck = [Card(r, s) for r in RANKS for s in SUITS]
    used = {str(c) for c in board} | {str(hole[0]), str(hole[1])}
    remaining = [c for c in all_deck if str(c) not in used]

    best_villain: tuple[int, list[int]] | None = None
    for v1, v2 in itertools.combinations(remaining, 2):
        if str(v1) in used or str(v2) in used:
            continue
        score = evaluate_hand((v1, v2), board)
        if best_villain is None or compare_hands(score, best_villain) > 0:
            best_villain = score

    if best_villain is None:
        return 0.5

    if compare_hands(hero_score, best_villain) >= 0:
        return 1.0

    # Approximate percentile by category
    cat_diff = hero_score[0] - best_villain[0]
    return max(0.0, min(1.0, 0.5 + cat_diff * 0.08))


def categorize_hand_strength(hole: tuple[Card, Card], board: list[Card]) -> str:
    """Classify as value, bluff, or marginal."""
    score = evaluate_hand(hole, board)
    category = score[0]
    nut = nut_rank_on_board(hole, board)

    if category >= 4 or nut >= 0.85:
        return "value"
    if category <= 1 and nut < 0.35:
        return "bluff"
    return "marginal"
