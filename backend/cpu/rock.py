"""岩(ロック): 強い手札しか参加しない超タイトパッシブなCPU。
ベット/レイズはめったにせず、弱い手はすぐ降りる初級者向けタイプ。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    bet_amount,
    can_bet,
    can_raise,
    fold_or_check,
)
from cpu.strength import hand_strength


class RockCPU(CPUStrategy):
    display_name = "岩(ロック)"
    level = "beginner"

    VALUE_THRESHOLD = 0.72
    CALL_THRESHOLD = 0.45
    RAISE_THRESHOLD = 0.9
    RAISE_FREQUENCY = 0.3

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)

        if "call" not in ctx.valid_actions:
            if can_bet(ctx) and strength >= self.VALUE_THRESHOLD:
                amount = bet_amount(ctx, int(ctx.pot * 0.5))
                return CPUDecision("bet", amount)
            return fold_or_check(ctx)

        if strength < self.CALL_THRESHOLD:
            return CPUDecision("fold")
        if strength >= self.RAISE_THRESHOLD and can_raise(ctx) and self.rng.random() < self.RAISE_FREQUENCY:
            return CPUDecision("raise", ctx.min_raise_to)
        return CPUDecision("call")


STRATEGY_CLASS = RockCPU
