"""CPU(コンピュータ対戦相手)プラグインの共通インターフェース。

新しいCPUタイプを追加するには、backend/cpu/ 配下に1ファイル追加し、
CPUStrategy を継承したクラスを定義した上で、モジュール末尾に
`STRATEGY_CLASS = クラス名` を書くだけでよい。backend/cpu/__init__.py が
起動時に自動でこのパッケージ内のモジュールを読み込み、卓のCPU自動着席の
抽選対象に加える。
"""
from __future__ import annotations

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class CPUDecisionContext:
    """CPUが手番でアクションを決める時点の卓の状況。"""

    hole_cards: tuple[str, str]
    community_cards: tuple[str, ...]
    valid_actions: tuple[str, ...]
    pot: int
    current_bet: int
    my_current_bet: int
    my_chips: int
    small_blind: int
    big_blind: int
    min_bet: int
    max_bet: int
    min_raise_to: int
    max_raise_to: int
    active_opponents: int
    phase: str


@dataclass(frozen=True)
class CPUDecision:
    action: str
    amount: int | None = None


class CPUStrategy(ABC):
    """1体のCPUプレイヤーの意思決定ロジック。プレイ傾向やレベルはサブクラスごとに定義する。"""

    display_name: str
    level: str

    def __init__(self, rng: random.Random | None = None) -> None:
        self.rng = rng or random.Random()

    @abstractmethod
    def decide(self, ctx: CPUDecisionContext) -> CPUDecision:
        ...


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(value, high))


def can_bet(ctx: CPUDecisionContext) -> bool:
    # スタックが min_bet(BB) に満たないショートスタックでも、全額のオールインベットは
    # poker_domain 側で合法 (amount == 手持ちチップ全額なら BB 未満でも許可される)。
    return "bet" in ctx.valid_actions and ctx.max_bet > 0


def bet_amount(ctx: CPUDecisionContext, target: int) -> int:
    """ベット目標額を合法範囲にクランプする。スタックが min_bet 未満のショート
    スタックは全額ベット(オールイン)以外に選択肢がないため、そちらに丸める。"""
    if ctx.max_bet < ctx.min_bet:
        return ctx.max_bet
    return clamp(target, ctx.min_bet, ctx.max_bet)


def can_raise(ctx: CPUDecisionContext) -> bool:
    return "raise" in ctx.valid_actions and ctx.max_raise_to >= ctx.min_raise_to


def fold_or_check(ctx: CPUDecisionContext) -> CPUDecision:
    """消極的な選択肢 (チェックできるならチェック、できなければフォールド)。"""
    if "check" in ctx.valid_actions:
        return CPUDecision("check")
    return CPUDecision("fold")


def call_or_check(ctx: CPUDecisionContext) -> CPUDecision:
    if "check" in ctx.valid_actions:
        return CPUDecision("check")
    return CPUDecision("call")
