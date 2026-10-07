"""REST API for the admin screen (user management, coin adjustment, table moderation)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from accounts_api import account_storage
from accounts_storage import AccountStorage
from admin_storage import create_admin_audit_log, create_admin_session_storage
from poker_service import TableNotFoundError, poker_service

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
admin_sessions = create_admin_session_storage(BASE_DIR)
admin_audit_log = create_admin_audit_log(BASE_DIR)


class AdminAccount(BaseModel):
    id: str
    username: str


def require_admin(authorization: str | None = Header(default=None)) -> AdminAccount:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="管理者としてログインしてください")
    token = authorization[len("Bearer ") :].strip()
    account_id = admin_sessions.get_account_id(token)
    if account_id is None:
        raise HTTPException(status_code=401, detail="セッションが無効です。再度ログインしてください")
    account = account_storage.get_account_by_id(account_id)
    if account is None or not account["is_admin"]:
        admin_sessions.delete_session(token)
        raise HTTPException(status_code=403, detail="管理者権限がありません")
    if account["is_frozen"]:
        admin_sessions.delete_session(token)
        raise HTTPException(status_code=403, detail="このアカウントは凍結されています")
    return AdminAccount(id=account["id"], username=account["username"])


AdminDep = Depends(require_admin)


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    username: str
    expires_at: str


@router.post("/admin/login", response_model=AdminLoginResponse)
def admin_login(req: AdminLoginRequest) -> AdminLoginResponse:
    account = account_storage.get_account_by_username(req.username)
    if account is None or not AccountStorage.verify_password(req.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")
    if not account["is_admin"]:
        raise HTTPException(status_code=403, detail="管理者権限がありません")
    if account["is_frozen"]:
        raise HTTPException(status_code=403, detail="このアカウントは凍結されています")
    token, expires_at = admin_sessions.create_session(account["id"])
    admin_audit_log.log(account["id"], account["username"], "admin_login")
    return AdminLoginResponse(token=token, username=account["username"], expires_at=expires_at)


@router.post("/admin/logout", status_code=204)
def admin_logout(authorization: str | None = Header(default=None)) -> None:
    if authorization and authorization.lower().startswith("bearer "):
        admin_sessions.delete_session(authorization[len("Bearer ") :].strip())


class AdminAccountSummary(BaseModel):
    id: str
    username: str
    coins: int
    is_admin: bool
    is_frozen: bool
    created_at: str
    last_login_at: str | None = None


@router.get("/admin/accounts", response_model=list[AdminAccountSummary])
def list_accounts(admin: AdminAccount = AdminDep) -> list[AdminAccountSummary]:
    return [AdminAccountSummary(**a) for a in account_storage.list_accounts()]


class FreezeRequest(BaseModel):
    frozen: bool
    reason: str = ""


@router.post("/admin/accounts/{account_id}/freeze", response_model=AdminAccountSummary)
def set_account_frozen(
    account_id: str, req: FreezeRequest, admin: AdminAccount = AdminDep
) -> AdminAccountSummary:
    if account_id == admin.id:
        raise HTTPException(status_code=400, detail="自分自身のアカウントは凍結できません")
    account = account_storage.get_account_by_id(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    account_storage.set_frozen(account_id, req.frozen)
    if req.frozen:
        admin_sessions.delete_sessions_for_account(account_id)
    admin_audit_log.log(
        admin.id,
        admin.username,
        "freeze_account" if req.frozen else "unfreeze_account",
        target=account_id,
        detail=json.dumps({"username": account["username"], "reason": req.reason}, ensure_ascii=False),
    )
    updated = account_storage.get_account_by_id(account_id)
    assert updated is not None
    return AdminAccountSummary(**updated)


class DeleteAccountRequest(BaseModel):
    reason: str = ""


@router.delete("/admin/accounts/{account_id}", status_code=204)
def admin_delete_account(
    account_id: str, req: DeleteAccountRequest = DeleteAccountRequest(), admin: AdminAccount = AdminDep
) -> None:
    if account_id == admin.id:
        raise HTTPException(status_code=400, detail="自分自身のアカウントは削除できません")
    account = account_storage.get_account_by_id(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    # 循環インポートを避けるため遅延インポート(accounts_api.delete_account と同じ手法)
    from hand_ranges_api import hand_range_storage
    from range_storage_sqlite import create_sqlite_range_storage

    range_storage = create_sqlite_range_storage(BASE_DIR, hand_range_storage)
    range_storage.delete_by_account_id(account_id)
    account_storage.delete_account(account_id)
    admin_sessions.delete_sessions_for_account(account_id)
    admin_audit_log.log(
        admin.id,
        admin.username,
        "delete_account",
        target=account_id,
        detail=json.dumps({"username": account["username"], "reason": req.reason}, ensure_ascii=False),
    )


class AdjustCoinsRequest(BaseModel):
    delta: int
    reason: str = ""


@router.post("/admin/accounts/{account_id}/coins", response_model=AdminAccountSummary)
def adjust_coins(
    account_id: str, req: AdjustCoinsRequest, admin: AdminAccount = AdminDep
) -> AdminAccountSummary:
    account = account_storage.get_account_by_id(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    old_coins = account["coins"]
    new_coins = account_storage.adjust_coins(account_id, req.delta)
    admin_audit_log.log(
        admin.id,
        admin.username,
        "adjust_coins",
        target=account_id,
        detail=json.dumps(
            {
                "username": account["username"],
                "delta": req.delta,
                "old_coins": old_coins,
                "new_coins": new_coins,
                "reason": req.reason,
            },
            ensure_ascii=False,
        ),
    )
    updated = account_storage.get_account_by_id(account_id)
    assert updated is not None
    return AdminAccountSummary(**updated)


@router.get("/admin/tables")
def list_tables(admin: AdminAccount = AdminDep) -> list[dict[str, Any]]:
    return poker_service.list_tables()


class ForceEndTableRequest(BaseModel):
    reason: str = ""


@router.post("/admin/tables/{table_id}/force-end")
async def force_end_table(
    table_id: str, req: ForceEndTableRequest = ForceEndTableRequest(), admin: AdminAccount = AdminDep
) -> dict[str, Any]:
    try:
        summary = await poker_service.force_end_table(table_id)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    admin_audit_log.log(
        admin.id,
        admin.username,
        "force_end_table",
        target=table_id,
        detail=json.dumps({"name": summary.get("name"), "reason": req.reason}, ensure_ascii=False),
    )
    return {"ok": True}


class AdminLogEntry(BaseModel):
    id: str
    admin_account_id: str
    admin_username: str
    action: str
    target: str | None = None
    detail: str | None = None
    created_at: str


@router.get("/admin/logs", response_model=list[AdminLogEntry])
def list_logs(limit: int = 200, admin: AdminAccount = AdminDep) -> list[AdminLogEntry]:
    return [AdminLogEntry(**entry) for entry in admin_audit_log.list_logs(limit=limit)]
