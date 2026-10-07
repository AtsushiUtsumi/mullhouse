"""SQLite-backed persistent storage for player accounts."""

from __future__ import annotations

import hashlib
import os
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


def _admin_usernames() -> set[str]:
    """管理者として扱うユーザー名の一覧。環境変数 ADMIN_USERNAMES (カンマ区切り) で指定する。

    アプリ内には「管理者に昇格させるUI」は存在しない(自己昇格を防ぐため)。運用側が
    環境変数で指定したユーザー名のアカウントだけが管理者になる。
    """
    raw = os.environ.get("ADMIN_USERNAMES", "")
    return {u.strip() for u in raw.split(",") if u.strip()}


def _row_to_account(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["is_admin"] = bool(d.get("is_admin", 0))
    d["is_frozen"] = bool(d.get("is_frozen", 0))
    return d


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
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(accounts)")}
            if "is_admin" not in columns:
                conn.execute("ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
            if "is_frozen" not in columns:
                conn.execute("ALTER TABLE accounts ADD COLUMN is_frozen INTEGER NOT NULL DEFAULT 0")
            if "last_login_at" not in columns:
                conn.execute("ALTER TABLE accounts ADD COLUMN last_login_at TEXT")
            conn.commit()
        self._sync_admin_usernames()

    def _sync_admin_usernames(self) -> None:
        """ADMIN_USERNAMES に含まれるユーザー名の既存アカウントを管理者に揃える。"""
        usernames = _admin_usernames()
        if not usernames:
            return
        placeholders = ",".join("?" for _ in usernames)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE accounts SET is_admin = 1 WHERE username IN ({placeholders}) AND is_admin = 0",
                tuple(usernames),
            )
            conn.commit()

    def create_account(self, username: str, password: str) -> dict[str, Any]:
        account_id = uuid.uuid4().hex
        password_hash = _hash_password(password)
        is_admin = 1 if username in _admin_usernames() else 0
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO accounts (id, username, password_hash, coins, is_admin)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (account_id, username, password_hash, INITIAL_COINS, is_admin),
                )
                conn.commit()
        except sqlite3.IntegrityError as e:
            raise UsernameTakenError(username) from e
        return {"id": account_id, "username": username, "coins": INITIAL_COINS, "is_admin": bool(is_admin)}

    def get_account_by_username(self, username: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, coins, is_admin, is_frozen, created_at, last_login_at "
                "FROM accounts WHERE username = ?",
                (username,),
            ).fetchone()
        if row is None:
            return None
        return _row_to_account(row)

    def get_account_by_id(self, account_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, coins, is_admin, is_frozen, created_at, last_login_at "
                "FROM accounts WHERE id = ?",
                (account_id,),
            ).fetchone()
        if row is None:
            return None
        return _row_to_account(row)

    def list_accounts(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, username, coins, is_admin, is_frozen, created_at, last_login_at "
                "FROM accounts ORDER BY created_at DESC"
            ).fetchall()
        return [_row_to_account(row) for row in rows]

    def record_login(self, account_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE accounts SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
                (account_id,),
            )
            conn.commit()

    def set_frozen(self, account_id: str, frozen: bool) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE accounts SET is_frozen = ? WHERE id = ?",
                (1 if frozen else 0, account_id),
            )
            conn.commit()
        return cur.rowcount > 0

    def adjust_coins(self, account_id: str, delta: int) -> int:
        """コインを増減させる(0未満にはならない)。新しい残高を返す。"""
        with self._connect() as conn:
            row = conn.execute("SELECT coins FROM accounts WHERE id = ?", (account_id,)).fetchone()
            if row is None:
                raise ValueError(f"Account not found: {account_id}")
            new_coins = max(0, row["coins"] + delta)
            conn.execute("UPDATE accounts SET coins = ? WHERE id = ?", (new_coins, account_id))
            conn.commit()
        return new_coins

    def delete_account(self, account_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
            conn.commit()
        return cur.rowcount > 0

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
