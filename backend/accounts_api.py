"""REST API for player account creation."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from accounts_storage import AccountStorage, UsernameTakenError, create_account_storage

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
account_storage = create_account_storage(BASE_DIR)


class CreateAccountRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class AccountResponse(BaseModel):
    id: str
    username: str
    coins: int


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/accounts", response_model=AccountResponse, status_code=201)
def create_account(req: CreateAccountRequest) -> AccountResponse:
    try:
        account = account_storage.create_account(req.username, req.password)
    except UsernameTakenError as e:
        raise HTTPException(status_code=409, detail="Username already taken") from e
    return AccountResponse(**account)


@router.post("/accounts/login", response_model=AccountResponse)
def login(req: LoginRequest) -> AccountResponse:
    account = account_storage.get_account_by_username(req.username)
    if account is None or not AccountStorage.verify_password(req.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return AccountResponse(id=account["id"], username=account["username"], coins=account["coins"])


@router.get("/accounts/{account_id}", response_model=AccountResponse)
def get_account(account_id: str) -> AccountResponse:
    account = account_storage.get_account_by_id(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountResponse(id=account["id"], username=account["username"], coins=account["coins"])
