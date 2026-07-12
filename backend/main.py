"""FastAPI server for range management and solver."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from accounts_api import account_storage
from accounts_api import router as accounts_router
from hand_ranges_api import router as hand_ranges_router
from poker_api import router as poker_router
from solver import solve_range
from storage import create_range_storage

BASE_DIR = Path(__file__).resolve().parent.parent
storage = create_range_storage(BASE_DIR)

app = FastAPI(title="Poker Range System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(poker_router, prefix="/api/poker")
app.include_router(accounts_router, prefix="/api")
app.include_router(hand_ranges_router, prefix="/api")


class RangeData(BaseModel):
    position: str
    board: str
    line: list[str]
    hero_range: dict[str, float] = Field(default_factory=dict)
    villain_range: dict[str, float] = Field(default_factory=dict)


class SolveRequest(BaseModel):
    position: str | None = None
    board: str | None = None
    line: list[str] | None = None
    data: RangeData | None = None
    iterations: int = 3000


class SaveRangeRequest(BaseModel):
    account_id: str
    data: RangeData
    title: str = ""


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/positions")
def get_positions() -> list[str]:
    return ["BTN_vs_BB", "CO_vs_BB", "SB_vs_BB", "HJ_vs_BB", "UTG_vs_BB"]


@app.get("/api/actions")
def get_actions() -> dict[str, list[str]]:
    return {
        "flop": ["flop_b33", "flop_b50", "flop_b75", "flop_x"],
        "turn": ["turn_b33", "turn_b50", "turn_b75", "turn_x"],
        "river": ["river_b33", "river_b50", "river_b60", "river_b75", "river_x"],
    }


@app.get("/api/ranges")
def api_list_ranges(account_id: str) -> list[dict[str, Any]]:
    if account_storage.get_account_by_id(account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return storage.list_ranges(account_id)


@app.get("/api/ranges/{position}/{board}/{line_path:path}")
def api_get_range(position: str, board: str, line_path: str, account_id: str) -> dict[str, Any]:
    if account_storage.get_account_by_id(account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return storage.load_range(position, board, line_path, account_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="Range not found") from e


@app.post("/api/ranges")
def api_save_range(req: SaveRangeRequest) -> dict[str, str]:
    if account_storage.get_account_by_id(req.account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        path = storage.save_range(req.data.model_dump(), req.account_id, req.title)
        return {"path": path, "message": "saved"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/solve")
def api_solve(req: SolveRequest) -> dict[str, Any]:
    try:
        if req.data:
            result = solve_range(req.data.model_dump(), iterations=req.iterations)
        elif req.position and req.board and req.line:
            if not storage.range_exists(req.position, req.board, req.line):
                raise HTTPException(status_code=404, detail="Range not found")
            data = storage.load_range_by_line(req.position, req.board, req.line)
            result = solve_range(data, iterations=req.iterations)
            result["source"] = storage.source_path(req.position, req.board, req.line)
        else:
            raise HTTPException(status_code=400, detail="Provide data or position/board/line")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def cli_solve(file_path: str) -> None:
    import json

    path = Path(file_path)
    if not path.is_absolute():
        candidate = Path.cwd() / path
        if candidate.exists():
            path = candidate
        else:
            path = BASE_DIR / path
    from solver import load_range

    data = load_range(path)
    result = solve_range(data)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "solve":
        cli_solve(sys.argv[2])
    else:
        import uvicorn

        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
