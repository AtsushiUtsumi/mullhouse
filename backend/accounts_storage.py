"""SQLite-backed persistent storage for player accounts."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from pathlib import Path
from typing import Any

INITIAL_COINS = 10_000
_PBKDF2_ITERATIONS = 600_000


class UsernameTakenError(Exception):
    pass


def default_db_path(base_dir: Path) -> Path:
    db_dir = base_dir / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "mullhouse.db"


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${derived.hex()}"


class AccountStorage:
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
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    coins INTEGER NOT NULL DEFAULT 10000,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                )
                """
            )
            conn.commit()

    def create_account(self, username: str, password: str) -> dict[str, Any]:
        account_id = uuid.uuid4().hex
        password_hash = _hash_password(password)
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO accounts (id, username, password_hash, coins)
                    VALUES (?, ?, ?, ?)
                    """,
                    (account_id, username, password_hash, INITIAL_COINS),
                )
                conn.commit()
        except sqlite3.IntegrityError as e:
            raise UsernameTakenError(username) from e
        return {"id": account_id, "username": username, "coins": INITIAL_COINS}

    def get_account_by_username(self, username: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, coins FROM accounts WHERE username = ?",
                (username,),
            ).fetchone()
        if row is None:
            return None
        return dict(row)

    def get_account_by_id(self, account_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, coins FROM accounts WHERE id = ?",
                (account_id,),
            ).fetchone()
        if row is None:
            return None
        return dict(row)

    @staticmethod
    def verify_password(password: str, stored_hash: str) -> bool:
        algorithm, iterations, salt_hex, hash_hex = stored_hash.split("$")
        assert algorithm == "pbkdf2_sha256"
        derived = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return secrets.compare_digest(derived.hex(), hash_hex)


def create_account_storage(base_dir: Path) -> AccountStorage:
    storage = AccountStorage(default_db_path(base_dir))
    storage.init_schema()
    return storage
