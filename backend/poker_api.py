"""REST + WebSocket API for the poker table feature."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, field_validator

from poker_domain import (
    InvalidActionError,
    InvalidBuyInError,
    InvalidPlayerError,
    PokerError,
    RebuyNotAllowedError,
)
from poker_service import AuthError, TableNotFoundError, build_payload, poker_service

router = APIRouter()


class CreateTableRequest(BaseModel):
    name: str | None = None
    max_players: int = 6
    rake_percent: float = 0.0
    rake_cap: int | None = None
    rake_min_pot: int | None = None
    level_schedule: list[tuple[int, int, int]] = [(25, 50, 0)]
    level_up_interval_minutes: int | None = None
    require_full_table: bool = False
    initial_chips: int | None = None
    allow_rebuy: bool = True
    timeout_seconds: int = 15

    @field_validator("level_schedule")
    @classmethod
    def _require_at_least_one_level(cls, v: list[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
        if not v:
            raise ValueError("level_schedule must contain at least one level")
        return v


class JoinRequest(BaseModel):
    display_name: str | None = None
    buy_in: int = 1000


class LeaveRequest(BaseModel):
    player_id: str
    token: str


class ActionRequest(BaseModel):
    player_id: str
    token: str
    action: Literal["fold", "check", "call", "bet", "raise"]
    amount: int | None = None


class RebuyRequest(BaseModel):
    player_id: str
    token: str
    buy_in: int = 1000


def _raise_for_domain_error(e: PokerError) -> None:
    if isinstance(e, (InvalidPlayerError, RebuyNotAllowedError)):
        raise HTTPException(status_code=403, detail=str(e)) from e
    if isinstance(e, (InvalidActionError, InvalidBuyInError)):
        raise HTTPException(status_code=400, detail=str(e)) from e
    raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/tables")
async def create_table(req: CreateTableRequest) -> dict[str, Any]:
    meta = poker_service.create_table(
        req.name,
        req.level_schedule,
        req.max_players,
        rake_percent=req.rake_percent,
        rake_cap=req.rake_cap,
        rake_min_pot=req.rake_min_pot,
        level_up_interval_minutes=req.level_up_interval_minutes,
        require_full_table=req.require_full_table,
        initial_chips=req.initial_chips,
        allow_rebuy=req.allow_rebuy,
        timeout_seconds=req.timeout_seconds,
    )
    return meta.summary()


@router.get("/tables")
def list_tables() -> list[dict[str, Any]]:
    return poker_service.list_tables()


@router.get("/tables/{table_id}")
def get_table(table_id: str) -> dict[str, Any]:
    try:
        return poker_service.get_meta(table_id).summary()
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e


@router.post("/tables/{table_id}/join")
async def join_table(table_id: str, req: JoinRequest) -> dict[str, Any]:
    try:
        return await poker_service.join_table(table_id, req.display_name, req.buy_in)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    except PokerError as e:
        _raise_for_domain_error(e)


@router.post("/tables/{table_id}/leave")
async def leave_table(table_id: str, req: LeaveRequest) -> dict[str, Any]:
    try:
        await poker_service.leave_table(table_id, req.player_id, req.token)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except PokerError as e:
        _raise_for_domain_error(e)
    return {"ok": True}


@router.get("/tables/{table_id}/state")
def get_state(table_id: str, player_id: str, token: str) -> dict[str, Any]:
    try:
        return poker_service.get_state_for(table_id, player_id, token)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post("/tables/{table_id}/action")
async def submit_action(table_id: str, req: ActionRequest) -> dict[str, Any]:
    try:
        return await poker_service.submit_action(table_id, req.player_id, req.token, req.action, req.amount)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except PokerError as e:
        _raise_for_domain_error(e)


@router.post("/tables/{table_id}/rebuy")
async def rebuy(table_id: str, req: RebuyRequest) -> dict[str, Any]:
    try:
        return await poker_service.rebuy(table_id, req.player_id, req.token, req.buy_in)
    except TableNotFoundError as e:
        raise HTTPException(status_code=404, detail="Table not found") from e
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except PokerError as e:
        _raise_for_domain_error(e)


@router.websocket("/tables/{table_id}/ws")
async def table_ws(websocket: WebSocket, table_id: str, player_id: str, token: str) -> None:
    try:
        meta = poker_service.get_meta(table_id)
    except TableNotFoundError:
        await websocket.close(code=4404)
        return
    if meta.tokens.get(player_id) != token:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    poker_service.register_ws(meta, player_id, websocket)
    try:
        await websocket.send_json(build_payload(meta, player_id))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        poker_service.unregister_ws(meta, player_id)
