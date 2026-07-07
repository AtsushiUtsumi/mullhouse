"""REST + WebSocket API for the poker table feature."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from poker_domain import InvalidActionError, InvalidPlayerError, PokerError
from poker_service import AuthError, TableNotFoundError, build_payload, poker_service

router = APIRouter()


class CreateTableRequest(BaseModel):
    name: str | None = None
    small_blind: int = 25
    big_blind: int = 50
    max_players: int = 6


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


def _raise_for_domain_error(e: PokerError) -> None:
    if isinstance(e, InvalidPlayerError):
        raise HTTPException(status_code=403, detail=str(e)) from e
    if isinstance(e, InvalidActionError):
        raise HTTPException(status_code=400, detail=str(e)) from e
    raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/tables")
def create_table(req: CreateTableRequest) -> dict[str, Any]:
    meta = poker_service.create_table(req.name, req.small_blind, req.big_blind, req.max_players)
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
