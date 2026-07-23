"""In-memory poker table registry: lifecycle, auth, concurrency, auto-progression, serialization."""

from __future__ import annotations

import asyncio
import logging
import random
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

from cpu import CPUDecisionContext, CPUStrategy, random_strategy
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
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_CPU_BUY_IN = 1000
CPU_THINK_MIN_SECONDS = 0.6
CPU_THINK_MAX_SECONDS = 1.8


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
        "level": state.level,
        "status": state.status.name,
        "side_pots": [serialize_pot(p) for p in state.side_pots],
        "rake_percent": state.rake_percent,
        "rake_cap": state.rake_cap,
        "rake_min_pot": state.rake_min_pot,
        "action_log": [
            {
                "player_id": e.player_id,
                "phase": e.phase.name,
                "action": e.action,
                "amount": e.amount,
            }
            for e in state.action_log
        ],
    }


def compute_waiting_for(state: GameState, timeout_seconds: int) -> dict[str, Any] | None:
    """Derived independently from GameState (documented turn/betting rules), not from
    poker_domain's private _build_waiting_for, so it stays valid for both the
    ActionResult-driven paths and the plain GET /state reconnect/polling path."""
    if state.phase in (GamePhase.WAITING, GamePhase.SHOWDOWN) or state.current_player_id is None:
        return None
    current = next(p for p in state.players if p.player_id == state.current_player_id)
    # アンティ拠出がcurrent_betに混入する poker_domain 側の既知の不整合により、
    # 稀に自分の current_bet がテーブルの current_bet を上回ることがある。
    # その場合も call ではなく check を提示しないと Call 適用時に diff が負になり例外になる。
    actions = ["fold", "check" if current.current_bet.amount >= state.current_bet.amount else "call"]
    actions.append("bet" if state.current_bet.amount == 0 else "raise")
    return {
        "player_id": state.current_player_id,
        "valid_actions": actions,
        "timeout_seconds": timeout_seconds,
    }


def compute_rebuy_available(
    state: GameState, max_players: int, viewer_player_id: str, allow_rebuy: bool
) -> bool:
    """Whether `viewer_player_id` could (re)join with a fresh buy-in right now.

    Only meaningful between hands (WAITING/SHOWDOWN), matching poker_domain's own
    add_player/remove_player phase gate, so the frontend can hide/disable the
    rebuy button instead of always offering it and failing.
    """
    if not allow_rebuy:
        return False
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
    max_players: int
    timeout_seconds: int
    created_at: datetime
    table: PokerTable
    level_schedule: list[tuple[int, int, int]]
    rake_percent: float = 0.0
    rake_cap: int | None = None
    rake_min_pot: int | None = None
    require_full_table: bool = False
    initial_chips: int | None = None
    allow_rebuy: bool = True
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    tokens: dict[str, str] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)
    connections: dict[str, WebSocket] = field(default_factory=dict)
    cpu_players: dict[str, CPUStrategy] = field(default_factory=dict)
    auto_start_task: asyncio.Task | None = None
    auto_next_hand_task: asyncio.Task | None = None
    level_up_task: asyncio.Task | None = None
    pending_turn_task: asyncio.Task | None = None

    def summary(self) -> dict[str, Any]:
        state = self.table.get_state()
        return {
            "table_id": self.table_id,
            "name": self.name,
            "small_blind": state.small_blind.amount,
            "big_blind": state.big_blind.amount,
            "ante": state.ante.amount,
            "level": state.level,
            "rake_percent": self.rake_percent,
            "max_players": self.max_players,
            "seated": len(state.players),
            "phase": state.phase.name,
            "status": state.status.name,
            "require_full_table": self.require_full_table,
            "initial_chips": self.initial_chips,
            "allow_rebuy": self.allow_rebuy,
            "timeout_seconds": self.timeout_seconds,
            "created_at": self.created_at.isoformat(),
        }


def _require_auth(meta: TableMeta, player_id: str, token: str) -> None:
    if meta.tokens.get(player_id) != token:
        raise AuthError("invalid player_id or token")


def _seat_action_rank(seat_index: int, dealer_index: int, num_seats: int, phase: GamePhase) -> int:
    """座席インデックスを、現在のフェーズにおける行動順(0=最初, num_seats-1=最後)に変換する。
    poker_domain 側の着手順ロジック(table.py の start_game/_advance_phase)と対応させている。
    """
    if phase is GamePhase.PRE_FLOP:
        start = dealer_index if num_seats == 2 else (dealer_index + 3) % num_seats
    else:
        start = (dealer_index + 1) % num_seats
    return (seat_index - start) % num_seats


def _players_to_act_after(state: GameState, player_id: str) -> int:
    """現在のベッティングラウンドで、自分より後に行動する(フォールド/オールインしていない)人数。"""
    players = state.players
    num_seats = len(players)
    dealer_index = next(i for i, p in enumerate(players) if p.player_id == state.dealer_id)
    hero_index = next(i for i, p in enumerate(players) if p.player_id == player_id)
    hero_rank = _seat_action_rank(hero_index, dealer_index, num_seats, state.phase)
    return sum(
        1
        for i, p in enumerate(players)
        if p.player_id != player_id
        and not p.folded
        and not p.is_all_in
        and _seat_action_rank(i, dealer_index, num_seats, state.phase) > hero_rank
    )


def build_cpu_context(
    meta: TableMeta, player_id: str, waiting_for: dict[str, Any]
) -> CPUDecisionContext | None:
    state = meta.table.get_state(viewer_player_id=player_id)
    me = next((p for p in state.players if p.player_id == player_id), None)
    if me is None or me.hole_cards is None:
        return None
    my_chips = me.chips.amount
    my_current_bet = me.current_bet.amount
    active_opponents = sum(1 for p in state.players if p.player_id != player_id and not p.folded)
    players_to_act_after = _players_to_act_after(state, player_id)
    return CPUDecisionContext(
        hole_cards=(serialize_card(me.hole_cards[0]), serialize_card(me.hole_cards[1])),
        community_cards=tuple(serialize_card(c) for c in state.community_cards),
        valid_actions=tuple(waiting_for["valid_actions"]),
        pot=state.pot.amount,
        current_bet=state.current_bet.amount,
        my_current_bet=my_current_bet,
        my_chips=my_chips,
        small_blind=state.small_blind.amount,
        big_blind=state.big_blind.amount,
        min_bet=state.big_blind.amount,
        max_bet=my_chips,
        min_raise_to=state.current_bet.amount * 2,
        max_raise_to=my_current_bet + my_chips,
        active_opponents=active_opponents,
        phase=state.phase.name,
        players_to_act_after=players_to_act_after,
    )


def build_payload(meta: TableMeta, player_id: str, events: list[GameEvent] | None = None) -> dict[str, Any]:
    state = meta.table.get_state(viewer_player_id=player_id)
    return {
        "type": "state",
        "state": serialize_state(state, meta.names),
        "waiting_for": compute_waiting_for(state, meta.timeout_seconds),
        "rebuy_available": compute_rebuy_available(state, meta.max_players, player_id, meta.allow_rebuy),
        "max_players": meta.max_players,
        "require_full_table": meta.require_full_table,
        "initial_chips": meta.initial_chips,
        "events": [serialize_event(e) for e in (events or [])],
    }


class PokerService:
    def __init__(self) -> None:
        self._tables: dict[str, TableMeta] = {}

    def create_table(
        self,
        name: str | None,
        level_schedule: list[tuple[int, int, int]],
        max_players: int,
        rake_percent: float = 0.0,
        rake_cap: int | None = None,
        rake_min_pot: int | None = None,
        level_up_interval_minutes: int | None = None,
        require_full_table: bool = False,
        initial_chips: int | None = None,
        allow_rebuy: bool = True,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        fill_with_cpu: bool = False,
    ) -> TableMeta:
        table_id = uuid.uuid4().hex[:8]
        small_blind, big_blind, ante = level_schedule[0]
        meta = TableMeta(
            table_id=table_id,
            name=name or f"Table {table_id}",
            max_players=max_players,
            timeout_seconds=timeout_seconds,
            created_at=datetime.now(timezone.utc),
            rake_percent=rake_percent,
            rake_cap=rake_cap,
            rake_min_pot=rake_min_pot,
            level_schedule=level_schedule,
            require_full_table=require_full_table,
            initial_chips=initial_chips,
            allow_rebuy=allow_rebuy,
            table=PokerTable(
                table_id=table_id,
                max_players=max_players,
                small_blind=small_blind,
                big_blind=big_blind,
                ante=ante,
                timeout_seconds=timeout_seconds,
                level_schedule=level_schedule,
                rake_percent=rake_percent,
                rake_cap=rake_cap,
                rake_min_pot=rake_min_pot,
                fixed_buy_in=initial_chips,
                allow_rebuy=allow_rebuy,
            ),
        )
        self._tables[table_id] = meta
        if fill_with_cpu:
            # 作成者自身がこの後「参加」で座る分の1席を必ず残しておく
            self._seat_cpu_players(meta, max(0, max_players - 1))
        if level_up_interval_minutes and len(level_schedule) > 1:
            meta.level_up_task = asyncio.create_task(
                self._run_level_up_loop(meta, level_up_interval_minutes * 60)
            )
        return meta

    def _seat_cpu_players(self, meta: TableMeta, count: int) -> None:
        rng = random.Random()
        buy_in = meta.initial_chips or DEFAULT_CPU_BUY_IN
        name_counts: dict[str, int] = {}
        for _ in range(count):
            strategy = random_strategy(rng)
            name_counts[strategy.display_name] = name_counts.get(strategy.display_name, 0) + 1
            suffix = f" {name_counts[strategy.display_name]}" if name_counts[strategy.display_name] > 1 else ""
            player_id = f"cpu-{uuid.uuid4().hex[:8]}"
            meta.table.add_player(player_id=player_id, chips=Chips(buy_in))
            meta.names[player_id] = f"CPU:{strategy.display_name}{suffix}"
            meta.cpu_players[player_id] = strategy

    def list_tables(self) -> list[dict[str, Any]]:
        """A single corrupted table (e.g. a poker_domain internal error) must not
        take the whole lobby listing down for every other table."""
        summaries = []
        for meta in self._tables.values():
            try:
                summary = meta.summary()
            except Exception:
                logger.exception("failed to summarize table %s; omitting from listing", meta.table_id)
                continue
            if summary["status"] == "CLOSED":
                continue
            summaries.append(summary)
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
            self._reschedule_action_timeout(meta)
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
                        self._reschedule_action_timeout(meta)
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
                        self._reschedule_action_timeout(meta)
                    except (NotEnoughPlayersError, GameAlreadyStartedError):
                        pass
        finally:
            meta.auto_next_hand_task = None
        await self._broadcast(meta, events)

    def _reschedule_action_timeout(self, meta: TableMeta) -> None:
        """現在手番のプレイヤー向けにシンキングタイムのタイマー(またはCPUの着手)を(再)設定する。

        呼び出し元はすべて meta.lock を保持した状態で呼ぶこと。既存のタイマーは
        古い手番を指しているので必ずキャンセルしてから、現在の手番に対して張り直す。
        """
        if meta.pending_turn_task is not None:
            meta.pending_turn_task.cancel()
            meta.pending_turn_task = None
        state = meta.table.get_state()
        waiting_for = compute_waiting_for(state, meta.timeout_seconds)
        if waiting_for is not None:
            meta.pending_turn_task = self._make_turn_task(meta, waiting_for["player_id"])

    def _make_turn_task(self, meta: TableMeta, player_id: str) -> asyncio.Task:
        """次の手番に対応するタスクを作る (自分自身をキャンセルしない、手番進行中の張り替え用)。"""
        if player_id in meta.cpu_players:
            return asyncio.create_task(self._run_cpu_turn(meta, player_id))
        return asyncio.create_task(self._run_action_timeout(meta, player_id))

    async def _run_action_timeout(self, meta: TableMeta, player_id: str) -> None:
        """シンキングタイムが経過しても手番のプレイヤーがアクションしなかった場合、
        チェックが可能ならチェック、そうでなければフォールドを強制する。"""
        task = asyncio.current_task()
        events: list[GameEvent] = []
        try:
            await asyncio.sleep(meta.timeout_seconds)
            async with meta.lock:
                state = meta.table.get_state()
                waiting_for = compute_waiting_for(state, meta.timeout_seconds)
                if waiting_for is None or waiting_for["player_id"] != player_id:
                    return
                action: Action = Check() if "check" in waiting_for["valid_actions"] else Fold()
                result = meta.table.action(player_id=player_id, action=action)
                events = list(result.events)
                if result.waiting_for is None and meta.table.get_state().phase == GamePhase.SHOWDOWN:
                    self._schedule_auto_next_hand(meta)
                next_state = meta.table.get_state()
                next_waiting_for = compute_waiting_for(next_state, meta.timeout_seconds)
                meta.pending_turn_task = (
                    self._make_turn_task(meta, next_waiting_for["player_id"])
                    if next_waiting_for is not None
                    else None
                )
        except asyncio.CancelledError:
            pass
        finally:
            if meta.pending_turn_task is task:
                meta.pending_turn_task = None
        await self._broadcast(meta, events)

    async def _run_cpu_turn(self, meta: TableMeta, player_id: str) -> None:
        """CPUプレイヤーの手番。少し「考える」間を置いてから、そのCPUの戦略モジュールに
        アクションを決めさせて実行する。戦略が無効なアクションを返した場合や例外を
        投げた場合は、人間のタイムアウトと同じくチェック/フォールドにフォールバックする。"""
        task = asyncio.current_task()
        events: list[GameEvent] = []
        try:
            await asyncio.sleep(random.uniform(CPU_THINK_MIN_SECONDS, CPU_THINK_MAX_SECONDS))
            async with meta.lock:
                state = meta.table.get_state()
                waiting_for = compute_waiting_for(state, meta.timeout_seconds)
                if waiting_for is None or waiting_for["player_id"] != player_id:
                    return
                fallback: Action = Check() if "check" in waiting_for["valid_actions"] else Fold()
                domain_action: Action = fallback
                strategy = meta.cpu_players.get(player_id)
                if strategy is not None:
                    ctx = build_cpu_context(meta, player_id, waiting_for)
                    if ctx is not None:
                        try:
                            decision = strategy.decide(ctx)
                            domain_action = build_action(decision.action, decision.amount)
                        except Exception:
                            logger.exception(
                                "CPU %s (%s) の意思決定に失敗したためフォールバックします",
                                player_id,
                                strategy.display_name,
                            )
                            domain_action = fallback
                try:
                    result = meta.table.action(player_id=player_id, action=domain_action)
                except InvalidActionError:
                    result = meta.table.action(player_id=player_id, action=fallback)
                except Exception:
                    # poker_domain 側の未知の不整合等で予期せぬ例外が出ても、
                    # このタスクが黙って落ちてテーブルの進行が停止するのは避ける。
                    logger.exception(
                        "CPU %s の手番適用中に予期しない例外が発生したためフォールバックします",
                        player_id,
                    )
                    result = meta.table.action(player_id=player_id, action=fallback)
                events = list(result.events)
                if result.waiting_for is None and meta.table.get_state().phase == GamePhase.SHOWDOWN:
                    self._schedule_auto_next_hand(meta)
                next_state = meta.table.get_state()
                next_waiting_for = compute_waiting_for(next_state, meta.timeout_seconds)
                meta.pending_turn_task = (
                    self._make_turn_task(meta, next_waiting_for["player_id"])
                    if next_waiting_for is not None
                    else None
                )
        except asyncio.CancelledError:
            pass
        finally:
            if meta.pending_turn_task is task:
                meta.pending_turn_task = None
        await self._broadcast(meta, events)

    async def _run_level_up_loop(self, meta: TableMeta, interval_seconds: float) -> None:
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                async with meta.lock:
                    if meta.table.get_table_status() == TableStatus.CLOSED:
                        break
                    events = []
                    if len(meta.level_schedule) > 1:
                        events.append(meta.table.level_up())
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
