"""Filesystem-backed range storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from solver import filename_to_line, get_range_path, line_to_filename, validate_range_data


class FilesystemRangeStorage:
    def __init__(self, base_dir: Path, project_dir: Path) -> None:
        self.base_dir = base_dir
        self.project_dir = project_dir

    def list_ranges(self) -> list[dict[str, str]]:
        results: list[dict[str, str]] = []
        if not self.base_dir.exists():
            return results
        for pos_dir in sorted(self.base_dir.iterdir()):
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
                            "path": str(json_file.relative_to(self.base_dir)),
                        }
                    )
        return results

    def load_range(self, position: str, board: str, line_path: str) -> dict[str, Any]:
        path = self.base_dir / position / board / line_path
        if not path.exists():
            raise FileNotFoundError("Range not found")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        validate_range_data(data)
        return data

    def save_range(self, data: dict[str, Any]) -> str:
        validate_range_data(data)
        path = get_range_path(self.base_dir, data["position"], data["board"], data["line"])
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return str(path.relative_to(self.project_dir))

    def range_exists(self, position: str, board: str, line: list[str]) -> bool:
        return get_range_path(self.base_dir, position, board, line).exists()

    def load_range_by_line(self, position: str, board: str, line: list[str]) -> dict[str, Any]:
        path = get_range_path(self.base_dir, position, board, line)
        if not path.exists():
            raise FileNotFoundError("Range not found")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        validate_range_data(data)
        return data

    def source_path(self, position: str, board: str, line: list[str]) -> str:
        path = get_range_path(self.base_dir, position, board, line)
        return str(path.relative_to(self.project_dir))
