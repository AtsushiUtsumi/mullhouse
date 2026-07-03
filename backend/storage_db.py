"""PostgreSQL-backed range storage."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from solver import filename_to_line, line_to_filename, validate_range_data


class DatabaseRangeStorage:
    def __init__(self, project_dir: Path, database_url: str) -> None:
        self.project_dir = project_dir
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ranges (
                    id SERIAL PRIMARY KEY,
                    position TEXT NOT NULL,
                    board TEXT NOT NULL,
                    line_path TEXT NOT NULL,
                    data JSONB NOT NULL,
                    UNIQUE (position, board, line_path)
                )
                """
            )
            conn.commit()

    def seed_from_directory(self, ranges_dir: Path) -> None:
        if not ranges_dir.exists():
            return
        with self._connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS count FROM ranges").fetchone()
            if count and count["count"] > 0:
                return
            for pos_dir in sorted(ranges_dir.iterdir()):
                if not pos_dir.is_dir():
                    continue
                for board_dir in sorted(pos_dir.iterdir()):
                    if not board_dir.is_dir():
                        continue
                    for json_file in sorted(board_dir.glob("*.json")):
                        with open(json_file, encoding="utf-8") as f:
                            data = json.load(f)
                        validate_range_data(data)
                        conn.execute(
                            """
                            INSERT INTO ranges (position, board, line_path, data)
                            VALUES (%(position)s, %(board)s, %(line_path)s, %(data)s::jsonb)
                            ON CONFLICT (position, board, line_path) DO NOTHING
                            """,
                            {
                                "position": data["position"],
                                "board": data["board"],
                                "line_path": json_file.name,
                                "data": json.dumps(data, ensure_ascii=False),
                            },
                        )
            conn.commit()

    def list_ranges(self) -> list[dict[str, str]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT position, board, line_path FROM ranges ORDER BY position, board, line_path"
            ).fetchall()
        return [
            {
                "position": row["position"],
                "board": row["board"],
                "line": filename_to_line(row["line_path"]),
                "path": f"{row['position']}/{row['board']}/{row['line_path']}",
            }
            for row in rows
        ]

    def load_range(self, position: str, board: str, line_path: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT data FROM ranges
                WHERE position = %(position)s AND board = %(board)s AND line_path = %(line_path)s
                """,
                {"position": position, "board": board, "line_path": line_path},
            ).fetchone()
        if row is None:
            raise FileNotFoundError("Range not found")
        data = row["data"]
        if isinstance(data, str):
            data = json.loads(data)
        validate_range_data(data)
        return data

    def save_range(self, data: dict[str, Any]) -> str:
        validate_range_data(data)
        line_path = line_to_filename(data["line"])
        payload = json.dumps(data, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ranges (position, board, line_path, data)
                VALUES (%(position)s, %(board)s, %(line_path)s, %(data)s::jsonb)
                ON CONFLICT (position, board, line_path)
                DO UPDATE SET data = EXCLUDED.data
                """,
                {
                    "position": data["position"],
                    "board": data["board"],
                    "line_path": line_path,
                    "data": payload,
                },
            )
            conn.commit()
        return str(Path("ranges") / data["position"] / data["board"] / line_path)

    def range_exists(self, position: str, board: str, line: list[str]) -> bool:
        line_path = line_to_filename(line)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM ranges
                WHERE position = %(position)s AND board = %(board)s AND line_path = %(line_path)s
                """,
                {"position": position, "board": board, "line_path": line_path},
            ).fetchone()
        return row is not None

    def load_range_by_line(self, position: str, board: str, line: list[str]) -> dict[str, Any]:
        return self.load_range(position, board, line_to_filename(line))

    def source_path(self, position: str, board: str, line: list[str]) -> str:
        line_path = line_to_filename(line)
        return str(Path("ranges") / position / board / line_path)


def create_database_storage(project_dir: Path) -> DatabaseRangeStorage:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for database storage")
    storage = DatabaseRangeStorage(project_dir, database_url)
    storage.init_schema()
    storage.seed_from_directory(project_dir / "ranges")
    return storage
