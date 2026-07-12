"""REST API for saving hand ranges."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from accounts_api import account_storage
from hand_ranges_storage import create_hand_range_storage

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
hand_range_storage = create_hand_range_storage(BASE_DIR)


class SaveHandRangeRequest(BaseModel):
    account_id: str
    data: dict[str, float] = Field(default_factory=dict)
    title: str = ""


class HandRangeResponse(BaseModel):
    id: str
    account_id: str
    data: dict[str, float]
    title: str


class HandRangeSummary(BaseModel):
    id: str
    account_id: str
    data: dict[str, float]
    title: str
    created_at: str


@router.post("/hand-ranges", response_model=HandRangeResponse, status_code=201)
def save_hand_range(req: SaveHandRangeRequest) -> HandRangeResponse:
    if account_storage.get_account_by_id(req.account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")
    result = hand_range_storage.save_hand_range(req.account_id, req.data, req.title)
    return HandRangeResponse(**result)


@router.get("/hand-ranges", response_model=list[HandRangeSummary])
def list_hand_ranges(account_id: str) -> list[HandRangeSummary]:
    if account_storage.get_account_by_id(account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")
    ranges = hand_range_storage.list_hand_ranges(account_id)
    return [HandRangeSummary(**r) for r in ranges]
