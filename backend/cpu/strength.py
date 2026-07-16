"""CPUモジュールが共有するハンド強さの簡易ヒューリスティック。

モンテカルロ等の厳密なエクイティ計算は手番のたびに走らせるには重いため、
プリフロップは Chen Formula、それ以降は役カテゴリベースの近似値で
0.0-1.0 に正規化したスコアを返す。
"""
from __future__ import annotations

from hand_eval import Card, evaluate_hand

_RANK_VALUE = {r: i for i, r in enumerate("23456789TJQKA")}
_CHEN_HIGH_CARD = {"A": 10.0, "K": 8.0, "Q": 7.0, "J": 6.0, "T": 5.0}


def _parse(card: str) -> tuple[str, str]:
    return card[0].upper(), card[1].lower()


def preflop_strength(hole_cards: tuple[str, str]) -> float:
    """Chen Formula による 0.0-1.0 のプリフロップ強さ (ポケットエース=1.0)。"""
    (r1, s1), (r2, s2) = _parse(hole_cards[0]), _parse(hole_cards[1])
    v1, v2 = _RANK_VALUE[r1], _RANK_VALUE[r2]
    high_rank = r1 if v1 >= v2 else r2
    high_value, low_value = max(v1, v2), min(v1, v2)

    score = _CHEN_HIGH_CARD.get(high_rank, (high_value + 2) / 2)

    if v1 == v2:
        score = max(score * 2, 5.0)

    if s1 == s2:
        score += 2.0

    if v1 != v2:
        gap = high_value - low_value - 1
        if gap <= 0:
            if high_value < _RANK_VALUE["Q"]:
                score += 1.0
        elif gap == 1:
            score -= 1.0
        elif gap == 2:
            score -= 2.0
        elif gap == 3:
            score -= 4.0
        else:
            score -= 5.0

    return max(0.0, min(score, 20.0)) / 20.0


def postflop_strength(hole_cards: tuple[str, str], community_cards: tuple[str, ...]) -> float:
    """役カテゴリ (0=ハイカード〜8=ストレートフラッシュ) をベースにした 0.0-1.0 の近似強さ。"""
    hole = (Card.from_str(hole_cards[0]), Card.from_str(hole_cards[1]))
    board = [Card.from_str(c) for c in community_cards]
    category, tiebreakers = evaluate_hand(hole, board)
    top_kicker_frac = tiebreakers[0] / 12.0 if tiebreakers else 0.0
    return min(1.0, (category + top_kicker_frac) / 9.0)


def hand_strength(hole_cards: tuple[str, str], community_cards: tuple[str, ...]) -> float:
    if not community_cards:
        return preflop_strength(hole_cards)
    return postflop_strength(hole_cards, community_cards)
