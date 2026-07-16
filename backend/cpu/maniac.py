"""マニアック: ほぼどんな手でも積極的にベット/レイズする超ルーズアグレッシブなCPU。
降りることがほとんどない、読みやすいが荒っぽい初級者向けタイプ。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    call_or_check,
    can_bet,
    can_raise,
    clamp,
)
from cpu.strength import hand_strength


class ManiacCPU(CPUStrategy):
    display_name = "マニアック"
    level = "beginner"

    FOLD_THRESHOLD = 0.12
    AGGRESSION = 0.65

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)

        if "call" not in ctx.valid_actions:
            if can_bet(ctx) and self.rng.random() < self.AGGRESSION:
                amount = clamp(int(ctx.pot * self.rng.uniform(0.7, 1.2)), ctx.min_bet, ctx.max_bet)
                return CPUDecision("bet", amount)
            return call_or_check(ctx)

        if strength < self.FOLD_THRESHOLD and ctx.current_bet >= ctx.my_chips:
            return CPUDecision("fold")
        if can_raise(ctx) and self.rng.random() < self.AGGRESSION:
            amount = clamp(
                int(ctx.current_bet + ctx.pot * self.rng.uniform(0.7, 1.2)),
                ctx.min_raise_to,
                ctx.max_raise_to,
            )
            return CPUDecision("raise", amount)
        return CPUDecision("call")


STRATEGY_CLASS = ManiacCPU
