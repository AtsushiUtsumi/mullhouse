"""In-memory poker table registry: lifecycle, auth, concurrency, auto-progression, serialization."""

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

from poker_domain import (
    Action,
    Bet,
    Call,
    Card,
    Check,
    Chips,
    Fold,
    GameAlreadyStartedError,
    GameEvent,
    GamePhase,
    GameState,
    Hand,
    InvalidActionError,
    NotEnoughPlayersError,
    PlayerState,
    PokerTable,
    Pot,
    Rank,
    Raise,
    Suit,
    TableStatus,
)

logger = logging.getLogger(__name__)

AUTO_START_DELAY = 2.0
AUTO_NEXT_HAND_DELAY = 3.0
DEFAULT_TIMEOUT_SECONDS = 30


class TableNotFoundError(Exception):
    pass


class AuthError(Exception):
    pass


_RANK_CHARS = {
    Rank.TWO: "2", Rank.THREE: "3", Rank.FOUR: "4", Rank.FIVE: "5",
    Rank.SIX: "6", Rank.SEVEN: "7", Rank.EIGHT: "8", Rank.NINE: "9",
    Rank.TEN: "T", Rank.JACK: "J", Rank.QUEEN: "Q", Rank.KING: "K", Rank.ACE: "A",
}
_SUIT_CHARS = {
    Suit.HEARTS: "h", Suit.DIAMONDS: "d", Suit.CLUBS: "c", Suit.SPADES: "s",
}


def serialize_card(card: Card) -> str:
    return f"{_RANK_CHARS[card.rank]}{_SUIT_CHARS[card.suit]}"


def serialize_hand(hand: Hand) -> dict[str, Any]:
    return {"rank": hand.rank.name, "cards": [serialize_card(c) for c in hand.cards]}


def serialize_player(ps: PlayerState, names: dict[str, str]) -> dict[str, Any]:
    return {
        "player_id": ps.player_id,
        "display_name": names.get(ps.player_id, ps.player_id),
        "chips": ps.chips.amount,
        "current_bet": ps.current_bet.amount,
        "folded": ps.folded,
        "is_all_in": ps.is_all_in,
        "hole_cards": [serialize_card(c) for c in ps.hole_cards] if ps.hole_cards is not None else None,
    }


def serialize_pot(pot: Pot) -> dict[str, Any]:
    return {
        "amount": pot.amount.amount,
        "eligible_player_ids": list(pot.eligible_player_ids),
    }


def serialize_state(state: GameState, names: dict[str, str]) -> dict[str, Any]:
    return {
        "table_id": state.table_id,
        "phase": state.phase.name,
        "pot": state.pot.amount,
        "current_bet": state.current_bet.amount,
        "community_cards": [serialize_card(c) for c in state.community_cards],
        "players": [serialize_player(p, names) for p in state.players],
        "current_player_id": state.current_player_id,
        "dealer_id": state.dealer_id,
        "small_blind": state.small_blind.amount,
        "big_blind": state.big_blind.amount,
        "ante": state.ante.amount,
        "blind_level": state.blind_level,
        "ante_level": state.ante_level,
        "status": state.status.name,
        "side_pots": [serialize_pot(p) for p in state.side_pots],
        "rake_percent": state.rake_percent,
        "rake_cap": state.rake_cap,
        "rake_min_pot": state.rake_min_pot,
    }


def compute_waiting_for(state: GameState, timeout_seconds: int) -> dict[str, Any] | None:
    """Derived independently from GameState (documented turn/betting rules), not from
    poker_domain's private _build_waiting_for, so it stays valid for both the
    ActionResult-driven paths and the plain GET /state reconnect/polling path."""
    if state.phase in (GamePhase.WAITING, GamePhase.SHOWDOWN) or state.current_player_id is None:
        return None
    current = next(p for p in state.players if p.player_id == state.current_player_id)
    actions = ["fold", "check" if current.current_bet.amount == state.current_bet.amount else "call"]
    actions.append("bet" if state.current_bet.amount == 0 else "raise")
    return {
        "player_id": state.current_player_id,
        "valid_actions": actions,
        "timeout_seconds": timeout_seconds,
    }


def compute_rebuy_available(state: GameState, max_players: int, viewer_player_id: str) -> bool:
    """Whether `viewer_player_id` could (re)join with a fresh buy-in right now.

    Only meaningful between hands (WAITING/SHOWDOWN), matching poker_domain's own
    add_player/remove_player phase gate, so the frontend can hide/disable the
    rebuy button instead of always offering it and failing.
    """
    if state.status == TableStatus.CLOSED:
        return False
    if state.phase not in (GamePhase.WAITING, GamePhase.SHOWDOWN):
        return False
    seated = any(p.player_id == viewer_player_id for p in state.players)
    if not seated and len(state.players) >= max_players:
        return False
    return True


def serialize_event(ev: GameEvent) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in ev.payload.items():
        if key == "community_cards":
            payload[key] = [serialize_card(c) for c in value]
        elif key == "hands":
            payload[key] = {pid: serialize_hand(h) for pid, h in value.items()}
        elif key == "pots":
            payload[key] = [serialize_pot(p) for p in value]
        else:
            payload[key] = value
    return {"type": ev.event_type.name.lower(), "payload": payload}


def build_action(action: str, amount: int | None) -> Action:
    if action == "fold":
        return Fold()
    if action == "check":
        return Check()
    if action == "call":
        return Call()
    if action == "bet":
        if amount is None:
            raise InvalidActionError("amount is required for bet")
        return Bet(amount=amount)
    if action == "raise":
        if amount is None:
            raise InvalidActionError("amount is required for raise")
        return Raise(amount=amount)
    raise InvalidActionError(f"unknown action: {action}")


@dataclass
class TableMeta:
    table_id: str
    name: str
    small_blind: int
    big_blind: int
    max_players: int
    timeout_seconds: int
    created_at: datetime
    table: PokerTable
    rake_percent: float = 0.0
    rake_cap: int | None = None
    rake_min_pot: int | None = None
    blind_schedule: list[tuple[int, int]] | None = None
    ante_schedule: list[int] | None = None
    require_full_table: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    tokens: dict[str, str] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)
    connections: dict[str, WebSocket] = field(default_factory=dict)
    auto_start_task: asyncio.Task | None = None
    auto_next_hand_task: asyncio.Task | None = None
    level_up_task: asyncio.Task | None = None

    def summary(self) -> dict[str, Any]:
        state = self.table.get_state()
        return {
            "table_id": self.table_id,
            "name": self.name,
            "small_blind": state.small_blind.amount,
            "big_blind": state.big_blind.amount,
            "ante": state.ante.amount,
            "blind_level": state.blind_level,
            "rake_percent": self.rake_percent,
            "max_players": self.max_players,
            "seated": len(state.players),
            "phase": state.phase.name,
            "status": state.status.name,
            "require_full_table": self.require_full_table,
            "created_at": self.created_at.isoformat(),
        }


def _require_auth(meta: TableMeta, player_id: str, token: str) -> None:
    if meta.tokens.get(player_id) != token:
        raise AuthError("invalid player_id or token")


def build_payload(meta: TableMeta, player_id: str, events: list[GameEvent] | None = None) -> dict[str, Any]:
    state = meta.table.get_state(viewer_player_id=player_id)
    return {
        "type": "state",
        "state": serialize_state(state, meta.names),
        "waiting_for": compute_waiting_for(state, meta.timeout_seconds),
        "rebuy_available": compute_rebuy_available(state, meta.max_players, player_id),
        "max_players": meta.max_players,
        "require_full_table": meta.require_full_table,
        "events": [serialize_event(e) for e in (events or [])],
    }


class PokerService:
    def __init__(self) -> None:
        self._tables: dict[str, TableMeta] = {}

    def create_table(
        self,
        name: str | None,
        small_blind: int,
        big_blind: int,
        max_players: int,
        rake_percent: float = 0.0,
        rake_cap: int | None = None,
        rake_min_pot: int | None = None,
        blind_schedule: list[tuple[int, int]] | None = None,
        ante_schedule: list[int] | None = None,
        level_up_interval_minutes: int | None = None,
        require_full_table: bool = False,
    ) -> TableMeta:
        table_id = uuid.uuid4().hex[:8]
        meta = TableMeta(
            table_id=table_id,
            name=name or f"Table {table_id}",
            small_blind=small_blind,
            big_blind=big_blind,
            max_players=max_players,
            timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            created_at=datetime.now(timezone.utc),
            rake_percent=rake_percent,
            rake_cap=rake_cap,
            rake_min_pot=rake_min_pot,
            blind_schedule=blind_schedule,
            ante_schedule=ante_schedule,
            require_full_table=require_full_table,
            table=PokerTable(
                table_id=table_id,
                max_players=max_players,
                small_blind=small_blind,
                big_blind=big_blind,
                timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
                blind_schedule=blind_schedule,
                ante_schedule=ante_schedule,
                rake_percent=rake_percent,
                rake_cap=rake_cap,
                rake_min_pot=rake_min_pot,
            ),
        )
        self._tables[table_id] = meta
        has_blind_levels = blind_schedule is not None and len(blind_schedule) > 1
        has_ante_levels = ante_schedule is not None and len(ante_schedule) > 1
        if level_up_interval_minutes and (has_blind_levels or has_ante_levels):
            meta.level_up_task = asyncio.create_task(
                self._run_level_up_loop(meta, level_up_interval_minutes * 60)
            )
        return meta

    def list_tables(self) -> list[dict[str, Any]]:
        """A single corrupted table (e.g. a poker_domain internal error) must not
        take the whole lobby listing down for every other table."""
        summaries = []
        for meta in self._tables.values():
            try:
                summaries.append(meta.summary())
            except Exception:
                logger.exception("failed to summarize table %s; omitting from listing", meta.table_id)
        return summaries

    def get_meta(self, table_id: str) -> TableMeta:
        meta = self._tables.get(table_id)
        if meta is None:
            raise TableNotFoundError(table_id)
        return meta

    async def join_table(self, table_id: str, display_name: str | None, buy_in: int) -> dict[str, Any]:
        meta = self.get_meta(table_id)
        async with meta.lock:
            player_id = uuid.uuid4().hex[:8]
            token = secrets.token_urlsafe(24)
            meta.table.add_player(player_id=player_id, chips=Chips(buy_in))
            meta.tokens[player_id] = token
            meta.names[player_id] = display_name or f"Player {player_id[:4]}"
            self._maybe_schedule_auto_start(meta)
        payload = build_payload(meta, player_id)
        return {"player_id": player_id, "token": token, "table_id": table_id, **payload}

    async def leave_table(self, table_id: str, player_id: str, token: str) -> None:
        meta = self.get_meta(table_id)
        _require_auth(meta, player_id, token)
        event: GameEvent
        async with meta.lock:
            event = meta.table.remove_player(player_id)
            meta.tokens.pop(player_id, None)
            meta.names.pop(player_id, None)
            meta.connections.pop(player_id, None)
            seated = len(meta.table.get_state().players)
            if seated < self._start_threshold(meta) and meta.auto_start_task is not None:
                meta.auto_start_task.cancel()
                meta.auto_start_task = None
        await self._broadcast(meta, [event])

    def get_state_for(self, table_id: str, player_id: str, token: str) -> dict[str, Any]:
        meta = self.get_meta(table_id)
        _require_auth(meta, player_id, token)
        return build_payload(meta, player_id)

    async def submit_action(
        self, table_id: str, player_id: str, token: str, action_name: str, amount: int | None
    ) -> dict[str, Any]:
        meta = self.get_meta(table_id)
        _require_auth(meta, player_id, token)
        domain_action = build_action(action_name, amount)
        async with meta.lock:
            result = meta.table.action(player_id=player_id, action=domain_action)
            events = list(result.events)
            if result.waiting_for is None and meta.table.get_state().phase == GamePhase.SHOWDOWN:
                self._schedule_auto_next_hand(meta)
        payload = build_payload(meta, player_id, events)
        await self._broadcast(meta, events)
        return payload

    async def rebuy(self, table_id: str, player_id: str, token: str, buy_in: int) -> dict[str, Any]:
        meta = self.get_meta(table_id)
        _require_auth(meta, player_id, token)
        async with meta.lock:
            state = meta.table.get_state()
            seated = next((p for p in state.players if p.player_id == player_id), None)
            if seated is not None and seated.chips.amount > 0:
                raise InvalidActionError("チップが残っているためリバイできません")
            if seated is not None:
                meta.table.remove_player(player_id)
            meta.table.add_player(player_id=player_id, chips=Chips(buy_in))
            self._maybe_schedule_auto_start(meta)
        payload = build_payload(meta, player_id)
        await self._broadcast(meta)
        return payload

    def register_ws(self, meta: TableMeta, player_id: str, ws: WebSocket) -> None:
        meta.connections[player_id] = ws

    def unregister_ws(self, meta: TableMeta, player_id: str) -> None:
        meta.connections.pop(player_id, None)

    def _start_threshold(self, meta: TableMeta) -> int:
        return meta.max_players if meta.require_full_table else 2

    def _maybe_schedule_auto_start(self, meta: TableMeta) -> None:
        state = meta.table.get_state()
        if (
            state.phase == GamePhase.WAITING
            and len(state.players) >= self._start_threshold(meta)
            and meta.auto_start_task is None
        ):
            meta.auto_start_task = asyncio.create_task(self._run_auto_start(meta))

    async def _run_auto_start(self, meta: TableMeta) -> None:
        events: list[GameEvent] = []
        try:
            await asyncio.sleep(AUTO_START_DELAY)
            async with meta.lock:
                state = meta.table.get_state()
                if state.phase == GamePhase.WAITING and len(state.players) >= self._start_threshold(meta):
                    try:
                        result = meta.table.start_game()
                        events = list(result.events)
                    except (NotEnoughPlayersError, GameAlreadyStartedError):
                        pass
        finally:
            meta.auto_start_task = None
        await self._broadcast(meta, events)

    def _schedule_auto_next_hand(self, meta: TableMeta) -> None:
        if meta.auto_next_hand_task is None:
            meta.auto_next_hand_task = asyncio.create_task(self._run_auto_next_hand(meta))

    async def _run_auto_next_hand(self, meta: TableMeta) -> None:
        events: list[GameEvent] = []
        try:
            await asyncio.sleep(AUTO_NEXT_HAND_DELAY)
            async with meta.lock:
                state = meta.table.get_state()
                eligible = [p for p in state.players if p.chips.amount > 0]
                if state.phase == GamePhase.SHOWDOWN and len(eligible) >= 2:
                    try:
                        result = meta.table.start_game()
                        events = list(result.events)
                    except (NotEnoughPlayersError, GameAlreadyStartedError):
                        pass
        finally:
            meta.auto_next_hand_task = None
        await self._broadcast(meta, events)

    async def _run_level_up_loop(self, meta: TableMeta, interval_seconds: float) -> None:
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                async with meta.lock:
                    if meta.table.get_table_status() == TableStatus.CLOSED:
                        break
                    events = []
                    if meta.blind_schedule is not None and len(meta.blind_schedule) > 1:
                        events.append(meta.table.level_up_blind())
                    if meta.ante_schedule is not None and len(meta.ante_schedule) > 1:
                        events.append(meta.table.level_up_ante())
                await self._broadcast(meta, events)
        except asyncio.CancelledError:
            pass
        finally:
            meta.level_up_task = None

    async def _broadcast(self, meta: TableMeta, events: list[GameEvent] | None = None) -> None:
        for player_id, ws in list(meta.connections.items()):
            try:
                await ws.send_json(build_payload(meta, player_id, events))
            except Exception:
                meta.connections.pop(player_id, None)


poker_service = PokerService()
