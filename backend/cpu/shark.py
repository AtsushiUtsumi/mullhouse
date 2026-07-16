"""シャーク: 強い手だけを選んでバリューを厚く取りにいくタイトアグレッシブなCPU。
ポットオッズを踏まえて降りるべき場面では素直に降り、まれにブラフも仕掛ける上級者向けタイプ。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    bet_amount,
    can_bet,
    can_raise,
    clamp,
    fold_or_check,
)
from cpu.strength import hand_strength


class SharkCPU(CPUStrategy):
    display_name = "シャーク"
    level = "advanced"

    VALUE_THRESHOLD = 0.62
    CALL_THRESHOLD = 0.45
    RAISE_THRESHOLD = 0.85
    BLUFF_FREQUENCY = 0.12

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)
        is_bluff = strength < 0.25 and self.rng.random() < self.BLUFF_FREQUENCY

        if "call" not in ctx.valid_actions:
            if can_bet(ctx) and (strength >= self.VALUE_THRESHOLD or is_bluff):
                fraction = 0.75 if strength >= self.VALUE_THRESHOLD else 0.5
                amount = bet_amount(ctx, int(ctx.pot * fraction))
                return CPUDecision("bet", amount)
            return fold_or_check(ctx)

        denom = ctx.pot + ctx.current_bet
        pot_odds = ctx.current_bet / denom if denom > 0 else 0.0
        if strength < max(self.CALL_THRESHOLD, pot_odds) and not is_bluff:
            return CPUDecision("fold")
        if can_raise(ctx) and (strength >= self.RAISE_THRESHOLD or is_bluff):
            fraction = 0.7 if strength >= self.RAISE_THRESHOLD else 0.5
            amount = clamp(int(ctx.current_bet + ctx.pot * fraction), ctx.min_raise_to, ctx.max_raise_to)
            return CPUDecision("raise", amount)
        return CPUDecision("call")


STRATEGY_CLASS = SharkCPU
