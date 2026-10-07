"""SQLite-backed storage for admin sessions and the admin audit log."""

from __future__ import annotations

import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from accounts_storage import default_db_path

SESSION_TTL_HOURS = 12


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class AdminSessionStorage:
    """管理者画面用のベアラートークンセッション。通常ユーザーのログイン状態とは独立している。"""

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
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    token TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def create_session(self, account_id: str) -> tuple[str, str]:
        token = secrets.token_urlsafe(32)
        created = _now()
        expires = created + timedelta(hours=SESSION_TTL_HOURS)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO admin_sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, account_id, _iso(created), _iso(expires)),
            )
            conn.commit()
        return token, _iso(expires)

    def get_account_id(self, token: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT account_id, expires_at FROM admin_sessions WHERE token = ?", (token,)
            ).fetchone()
            if row is None:
                return None
            expires_at = datetime.strptime(row["expires_at"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(
                tzinfo=timezone.utc
            )
            if expires_at < _now():
                conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
                conn.commit()
                return None
        return row["account_id"]

    def delete_session(self, token: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
            conn.commit()

    def delete_sessions_for_account(self, account_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE account_id = ?", (account_id,))
            conn.commit()


class AdminAuditLog:
    """管理者操作の監査ログ。"""

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
                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id TEXT PRIMARY KEY,
                    admin_account_id TEXT NOT NULL,
                    admin_username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target TEXT,
                    detail TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                )
                """
            )
            conn.commit()

    def log(
        self,
        admin_account_id: str,
        admin_username: str,
        action: str,
        target: str | None = None,
        detail: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO admin_audit_log (id, admin_account_id, admin_username, action, target, detail)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (uuid.uuid4().hex, admin_account_id, admin_username, action, target, detail),
            )
            conn.commit()

    def list_logs(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, admin_account_id, admin_username, action, target, detail, created_at "
                "FROM admin_audit_log ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]


def create_admin_session_storage(base_dir: Path) -> AdminSessionStorage:
    storage = AdminSessionStorage(default_db_path(base_dir))
    storage.init_schema()
    return storage


def create_admin_audit_log(base_dir: Path) -> AdminAuditLog:
    log = AdminAuditLog(default_db_path(base_dir))
    log.init_schema()
    return log
