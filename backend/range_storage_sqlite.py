"""SQLite-backed range storage for the range editor, linked to hand_ranges."""

from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from accounts_storage import default_db_path
from hand_ranges_storage import HandRangeStorage
from solver import filename_to_line, line_to_filename, validate_range_data


class SqliteRangeStorage:
    def __init__(self, db_path: Path, hand_range_storage: HandRangeStorage) -> None:
        self.db_path = db_path
        self.hand_range_storage = hand_range_storage

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS range_lines (
                    id TEXT PRIMARY KEY,
                    hand_range_id TEXT NOT NULL REFERENCES hand_ranges(id),
                    position TEXT NOT NULL,
                    board TEXT NOT NULL,
                    line_path TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    UNIQUE (position, board, line_path)
                )
                """
            )
            conn.commit()

    def list_ranges(self, account_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT rl.position, rl.board, rl.line_path, hr.title
                FROM range_lines rl
                JOIN hand_ranges hr ON hr.id = rl.hand_range_id
                WHERE hr.account_id = ?
                ORDER BY rl.position, rl.board, rl.line_path
                """,
                (account_id,),
            ).fetchall()
        return [
            {
                "position": row["position"],
                "board": row["board"],
                "line": filename_to_line(row["line_path"]),
                "path": f"{row['position']}/{row['board']}/{row['line_path']}",
                "title": row["title"],
            }
            for row in rows
        ]

    def load_range(self, position: str, board: str, line_path: str, account_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT rl.data FROM range_lines rl
                JOIN hand_ranges hr ON hr.id = rl.hand_range_id
                WHERE rl.position = ? AND rl.board = ? AND rl.line_path = ? AND hr.account_id = ?
                """,
                (position, board, line_path, account_id),
            ).fetchone()
        if row is None:
            raise FileNotFoundError("Range not found")
        data = json.loads(row["data"])
        validate_range_data(data)
        return data

    def save_range(self, data: dict[str, Any], account_id: str, title: str = "") -> str:
        validate_range_data(data)
        line_path = line_to_filename(data["line"])
        payload = json.dumps(data, ensure_ascii=False)

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT hand_range_id FROM range_lines WHERE position = ? AND board = ? AND line_path = ?",
                (data["position"], data["board"], line_path),
            ).fetchone()

        if existing is not None:
            hand_range_id = existing["hand_range_id"]
            self.hand_range_storage.update_hand_range(hand_range_id, data["hero_range"], title)
        else:
            result = self.hand_range_storage.save_hand_range(account_id, data["hero_range"], title)
            hand_range_id = result["id"]

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO range_lines (id, hand_range_id, position, board, line_path, data)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (position, board, line_path)
                DO UPDATE SET data = excluded.data, hand_range_id = excluded.hand_range_id
                """,
                (uuid.uuid4().hex, hand_range_id, data["position"], data["board"], line_path, payload),
            )
            conn.commit()

        return f"{data['position']}/{data['board']}/{line_path}"

    def range_exists(self, position: str, board: str, line: list[str]) -> bool:
        line_path = line_to_filename(line)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM range_lines WHERE position = ? AND board = ? AND line_path = ?",
                (position, board, line_path),
            ).fetchone()
        return row is not None

    def load_range_by_line(self, position: str, board: str, line: list[str]) -> dict[str, Any]:
        line_path = line_to_filename(line)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data FROM range_lines WHERE position = ? AND board = ? AND line_path = ?",
                (position, board, line_path),
            ).fetchone()
        if row is None:
            raise FileNotFoundError("Range not found")
        data = json.loads(row["data"])
        validate_range_data(data)
        return data

    def source_path(self, position: str, board: str, line: list[str]) -> str:
        return f"{position}/{board}/{line_to_filename(line)}"


def create_sqlite_range_storage(project_dir: Path, hand_range_storage: HandRangeStorage) -> SqliteRangeStorage:
    storage = SqliteRangeStorage(default_db_path(project_dir), hand_range_storage)
    storage.init_schema()
    return storage
