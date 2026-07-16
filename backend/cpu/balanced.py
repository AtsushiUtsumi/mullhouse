"""バランス型: ポットオッズに応じてコール/フォールドを判断しつつ、強さに応じた頻度で
ベット/レイズを混ぜる中級者向けCPU。極端な偏りがなく読みにくいのが特徴。
"""
from __future__ import annotations

from cpu.base import (
    CPUDecision,
    CPUDecisionContext,
    CPUStrategy,
    can_bet,
    can_raise,
    clamp,
    fold_or_check,
)
from cpu.strength import hand_strength


class BalancedCPU(CPUStrategy):
    display_name = "バランス型"
    level = "intermediate"

    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        strength = hand_strength(ctx.hole_cards, ctx.community_cards)

        if "call" not in ctx.valid_actions:
            bet_probability = max(0.0, strength - 0.4)
            if can_bet(ctx) and self.rng.random() < bet_probability:
                amount = clamp(int(ctx.pot * (0.4 + strength * 0.4)), ctx.min_bet, ctx.max_bet)
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


STRATEGY_CLASS = BalancedCPU
