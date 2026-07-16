"""CPU(コンピュータ対戦相手)モジュールのレジストリ。

backend/cpu/ 配下に .py ファイルを追加し、CPUStrategy を継承したクラスを
定義してモジュール末尾で `STRATEGY_CLASS = クラス名` としてエクスポートするだけで
新しいCPUタイプを追加できる (プラグイン方式)。「満員になるまでCPUを追加する」で
卓を作成すると、ここに登録されたクラスの中からランダムに選ばれて座席を埋める
(同じクラスが重複して選ばれることもある)。
"""
from __future__ import annotations

import importlib
import pkgutil
import random
from pathlib import Path

from cpu.base import CPUDecision, CPUDecisionContext, CPUStrategy

_STRATEGY_CLASSES: list[type[CPUStrategy]] = []


def _discover() -> None:
    package_dir = Path(__file__).parent
    for module_info in pkgutil.iter_modules([str(package_dir)]):
        if module_info.name == "base":
            continue
        module = importlib.import_module(f"cpu.{module_info.name}")
        strategy_class = getattr(module, "STRATEGY_CLASS", None)
        if strategy_class is not None:
            _STRATEGY_CLASSES.append(strategy_class)


_discover()


def available_strategies() -> list[type[CPUStrategy]]:
    return list(_STRATEGY_CLASSES)


def random_strategy(rng: random.Random) -> CPUStrategy:
    strategy_class = rng.choice(_STRATEGY_CLASSES)
    return strategy_class(rng=rng)


__all__ = [
    "CPUDecision",
    "CPUDecisionContext",
    "CPUStrategy",
    "available_strategies",
    "random_strategy",
]
