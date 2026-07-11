"""SQLite-backed storage for saved hand ranges."""

from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from accounts_storage import default_db_path


class HandRangeStorage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS hand_ranges (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                )
                """
            )
            conn.commit()

    def save_hand_range(self, account_id: str, data: dict[str, float]) -> dict[str, Any]:
        range_id = uuid.uuid4().hex
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO hand_ranges (id, account_id, data) VALUES (?, ?, ?)",
                (range_id, account_id, json.dumps(data)),
            )
            conn.commit()
        return {"id": range_id, "account_id": account_id, "data": data}

    def list_hand_ranges(self, account_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, account_id, data, created_at FROM hand_ranges WHERE account_id = ? ORDER BY created_at DESC",
                (account_id,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["data"] = json.loads(item["data"])
            results.append(item)
        return results


def create_hand_range_storage(base_dir: Path) -> HandRangeStorage:
    storage = HandRangeStorage(default_db_path(base_dir))
    storage.init_schema()
    return storage
