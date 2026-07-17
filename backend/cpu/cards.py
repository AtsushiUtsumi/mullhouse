"""ホールカード/ボードに関する判定をまとめた、CPU戦略から共通で使えるモデル。"""
from __future__ import annotations

from dataclasses import dataclass

from hand_eval import HAND_RANK_NAMES, Card, evaluate_hand, nut_rank_on_board

RANK_VALUE = {r: v for v, r in enumerate("23456789TJQKA", start=2)}
_VALUE_RANK = {v: r for r, v in RANK_VALUE.items()}
_CHEN_HIGH_CARD_POWER = {"A": 10.0, "K": 8.0, "Q": 7.0, "J": 6.0, "T": 5.0}


@dataclass(frozen=True)
class HoleHand:
    """プリフロップの2枚のホールカードに関する各種判定をまとめたもの。"""

    cards: tuple[str, str]
    high: int
    kicker: int
    is_suited: bool

    @classmethod
    def from_cards(cls, hole_cards: tuple[str, str]) -> "HoleHand":
        (r1, s1), (r2, s2) = ((c[0].upper(), c[1].lower()) for c in hole_cards)
        high, kicker = sorted((RANK_VALUE[r1], RANK_VALUE[r2]), reverse=True)
        return cls(cards=tuple(hole_cards), high=high, kicker=kicker, is_suited=s1 == s2)

    @property
    def is_pocket_pair(self) -> bool:
        return self.high == self.kicker

    @property
    def gap(self) -> int:
        """ハイカードとキッカーの間のギャップ数。コネクターやポケットペアは0。"""
        if self.is_pocket_pair:
            return 0
        return self.high - self.kicker - 1

    @property
    def power_number(self) -> float:
        """Chenフォーミュラにおけるハイカード基準の基本点(A=10, K=8, Q=7, J=6, T=5,
        9以下はランク値/2)。"""
        return _CHEN_HIGH_CARD_POWER.get(_VALUE_RANK[self.high], self.high / 2)

    def contains_rank(self, rank_value: int) -> bool:
        return rank_value in (self.high, self.kicker)


@dataclass(frozen=True)
class Board:
    """コミュニティカードに関する各種判定をまとめたもの。"""

    cards: tuple[str, ...]

    @property
    def num_cards(self) -> int:
        """現在の枚数(3=フロップ/4=ターン/5=リバー)。"""
        return len(self.cards)

    @property
    def ranks(self) -> tuple[int, ...]:
        return tuple(RANK_VALUE[c[0].upper()] for c in self.cards)

    @property
    def high_card(self) -> int:
        return max(self.ranks)

    @property
    def is_paired(self) -> bool:
        """同ランクが2枚以上あるか(ペアボード/セットボードなど)。"""
        ranks = self.ranks
        return len(set(ranks)) < len(ranks)

    @property
    def is_monotone(self) -> bool:
        """全カードが同じスートか(フラッシュが揃うボード)。"""
        suits = {c[1].lower() for c in self.cards}
        return len(suits) == 1

    @property
    def is_two_tone(self) -> bool:
        """出ているスートが2種類のみか(フラッシュドローが絡みやすいボード)。"""
        suits = {c[1].lower() for c in self.cards}
        return len(suits) == 2

    def contains_rank(self, rank_value: int) -> bool:
        return rank_value in self.ranks


class HandEvaluation:
    """ホールカードとボードを合わせた役の評価。"""

    def __init__(self, hand: HoleHand, board: Board) -> None:
        self.hand = hand
        self.board = board

    def _cards(self) -> tuple[tuple[Card, Card], list[Card]]:
        hole = (Card.from_str(self.hand.cards[0]), Card.from_str(self.hand.cards[1]))
        board = [Card.from_str(c) for c in self.board.cards]
        return hole, board

    def category(self) -> int:
        """役のカテゴリ(0=ハイカード〜8=ストレートフラッシュ)を判定する。"""
        hole, board = self._cards()
        category, _ = evaluate_hand(hole, board)
        return category

    def category_name(self) -> str:
        return HAND_RANK_NAMES[self.category()]

    def is_nuts(self) -> bool:
        """現在のボードであり得る最強のハンドと並ぶか、それを超えているか。"""
        if self.board.num_cards < 3:
            return False
        hole, board = self._cards()
        return nut_rank_on_board(hole, board) >= 1.0
