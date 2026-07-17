"""吉田の片割れ: プリフロップはキッカーの強さと後ろの人数でオープン/フォールドを、
ポストフロップはトップペア/ツーペア以上かどうかでベット/チェックコールを判断する
ハンドカテゴリベースの中級者向けCPU。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    bet_amount,
    call_or_check,
    can_bet,
    can_raise,
    clamp,
    fold_or_check,
)
from cpu.strength import hand_strength
from hand_eval import Card, evaluate_hand

_RANK_VALUE = {r: v for v, r in enumerate("23456789TJQKA", start=2)}


def _hole_ranks(hole_cards: tuple[str, str]) -> tuple[int, int]:
    """(ハイカードのランク, キッカーのランク) を返す。"""
    high, low = sorted((_RANK_VALUE[c[0].upper()] for c in hole_cards), reverse=True)
    return high, low


def _hand_category(hole_cards: tuple[str, str], community_cards: tuple[str, ...]) -> int:
    hole = (Card.from_str(hole_cards[0]), Card.from_str(hole_cards[1]))
    board = [Card.from_str(c) for c in community_cards]
    category, _ = evaluate_hand(hole, board)
    return category


def _has_top_pair(hole_cards: tuple[str, str], community_cards: tuple[str, ...], category: int) -> bool:
    if category != 1:
        return False
    board_top = max(_RANK_VALUE[c[0].upper()] for c in community_cards)
    return board_top in _hole_ranks(hole_cards)


class YoshidaCPU(CPUStrategy):
    """
    選択の優先度は以下の順番です
    プリフロップで自分の番まで全員がフォールド、かつ自分がレイズできるとき
    後ろのアクションを控えている人数に応じて以下の行動を選択します
    0人: チェック
    1人: キッカーが4以下かつTハイ以下のハンドはフォールド、それ以外はコール
    2人: キッカーが7以下のハンドはフォールド、それ以外は2.5BBレイズ
    3人: キッカーが8以下のハンドはフォールド、それ以外は2.5BBレイズ
    4人: キッカーが9以下のハンドはフォールド、それ以外は2.5BBレイズ
    5人: キッカーが9以下のハンドはフォールド、それ以外は2.5BBレイズ
    フロップでトップペアがツーペア以上の場合
    IPならポットの33%ベット、それ以外はチェック
    OOPならチェックコール
    それ以外の場合チェックフォールド
    ターンでトップペアかツーペア以上の場合
    IPならポットの75%ベット、それ以外はチェック
    OOPならチェックコール
    それ以外の場合チェックフォールド
    リバーでツーペア以上の場合
    IPならポットの75%ベット、それ以外はチェック
    OOPならチェックコール
    それ以外の場合チェックフォールド
    """
    display_name = "吉田の片割れ"
    level = "intermediate"

    _OPEN_FOLD_KICKER_THRESHOLD = {2: 7, 3: 8, 4: 9, 5: 9}
    _OPEN_RAISE_BB = 2.5
    _POSTFLOP_BET_FRACTION = {"FLOP": 0.33, "TURN": 0.75, "RIVER": 0.75}

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        if ctx.phase == "PRE_FLOP" and not ctx.community_cards:
            decision = self._decide_preflop_open(ctx)
            if decision is not None:
                return decision
        elif ctx.community_cards and ctx.phase in self._POSTFLOP_BET_FRACTION:
            return self._decide_postflop(ctx)

        return self._decide_fallback(ctx)

    def _decide_preflop_open(self, ctx: CPUDecisionContext) -> CPUDecision | None:
        """自分の番まで全員がフォールド(またはリンプ)してきた、いわゆるオープンの場面の判断。
        該当しない(誰かがレイズしている等)場合は None を返し、汎用ロジックに委ねる。
        """
        if not can_raise(ctx) or ctx.current_bet != ctx.big_blind:
            return None

        opponents = clamp(ctx.players_to_act_after, 0, 5)
        if opponents == 0:
            return fold_or_check(ctx)

        high, kicker = _hole_ranks(ctx.hole_cards)
        # ポケットペアはキッカーという概念がそぐわないため、フォールド判定の対象外にする
        is_pocket_pair = high == kicker

        if opponents == 1:
            if not is_pocket_pair and kicker <= 4 and high <= _RANK_VALUE["T"]:
                return CPUDecision("fold")
            return CPUDecision("call")

        threshold = self._OPEN_FOLD_KICKER_THRESHOLD[opponents]
        if not is_pocket_pair and kicker <= threshold:
            return CPUDecision("fold")
        amount = clamp(int(ctx.big_blind * self._OPEN_RAISE_BB), ctx.min_raise_to, ctx.max_raise_to)
        return CPUDecision("raise", amount)

    def _decide_postflop(self, ctx: CPUDecisionContext) -> CPUDecision:
        category = _hand_category(ctx.hole_cards, ctx.community_cards)
        if ctx.phase == "RIVER":
            is_value_hand = category >= 2
        else:
            is_value_hand = category >= 2 or _has_top_pair(ctx.hole_cards, ctx.community_cards, category)

        if not is_value_hand:
            return fold_or_check(ctx)

        if ctx.is_in_position:
            if can_bet(ctx):
                fraction = self._POSTFLOP_BET_FRACTION[ctx.phase]
                amount = bet_amount(ctx, int(ctx.pot * fraction))
                return CPUDecision("bet", amount)
            return fold_or_check(ctx)
        return call_or_check(ctx)

    def _decide_fallback(self, ctx: CPUDecisionContext) -> CPUDecision:
        """コメントのルールが対象としない場面(プリフロップでレイズに直面した場合など)の
        汎用ロジック。"""
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)

        if "call" not in ctx.valid_actions:
            bet_probability = max(0.0, strength - 0.4)
            if can_bet(ctx) and self.rng.random() < bet_probability:
                amount = bet_amount(ctx, int(ctx.pot * (0.4 + strength * 0.4)))
                return CPUDecision("bet", amount)
            return fold_or_check(ctx)

        denom = ctx.pot + ctx.current_bet
        pot_odds = ctx.current_bet / denom if denom > 0 else 0.0
        if strength < pot_odds * 0.9:
            return CPUDecision("fold")
        raise_probability = max(0.0, strength - 0.6)
        if can_raise(ctx) and self.rng.random() < raise_probability:
            amount = clamp(
                int(ctx.current_bet + ctx.pot * (0.4 + strength * 0.4)),
                ctx.min_raise_to,
                ctx.max_raise_to,
            )
            return CPUDecision("raise", amount)
        return CPUDecision("call")


STRATEGY_CLASS = YoshidaCPU
