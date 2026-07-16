"""コーリングステーション: ほぼ何でもコールし、自分からはめったにベット/レイズしない
ルーズパッシブなCPU。初級者向けタイプ。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    call_or_check,
    can_bet,
    clamp,
)
from cpu.strength import hand_strength


class CallingStationCPU(CPUStrategy):
    display_name = "コーリングステーション"
    level = "beginner"

    FOLD_THRESHOLD = 0.08
    BET_THRESHOLD = 0.8
    BET_FREQUENCY = 0.15

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)

        if "call" not in ctx.valid_actions:
            if can_bet(ctx) and strength >= self.BET_THRESHOLD and self.rng.random() < self.BET_FREQUENCY:
                amount = clamp(int(ctx.pot * 0.5), ctx.min_bet, ctx.max_bet)
                return CPUDecision("bet", amount)
            return call_or_check(ctx)

        if strength < self.FOLD_THRESHOLD and ctx.current_bet >= ctx.my_chips:
            return CPUDecision("fold")
        return CPUDecision("call")


STRATEGY_CLASS = CallingStationCPU
