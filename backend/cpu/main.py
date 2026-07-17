"""
cards.py (HoleHand / Board) の簡易動作確認スクリプト。
"""
from __future__ import annotations

from cpu.cards import RANK_VALUE, Board, HandEvaluation, HoleHand


def test_hole_hand_basic() -> None:
    hand = HoleHand.from_cards(("Ah", "Kd"))
    assert hand.high == RANK_VALUE["A"]
    assert hand.kicker == RANK_VALUE["K"]
    assert hand.is_suited is False
    assert hand.is_pocket_pair is False
    assert hand.gap == 0  # A-K は連続なのでギャップなし
    assert hand.power_number == 10.0  # Chenフォーミュラ: Aハイの基本点


def test_hole_hand_suited() -> None:
    hand = HoleHand.from_cards(("Ah", "2h"))
    assert hand.is_suited is True
    assert hand.gap == RANK_VALUE["A"] - RANK_VALUE["2"] - 1


def test_hole_hand_pocket_pair() -> None:
    hand = HoleHand.from_cards(("7h", "7d"))
    assert hand.is_pocket_pair is True
    assert hand.gap == 0
    assert hand.contains_rank(RANK_VALUE["7"])
    assert not hand.contains_rank(RANK_VALUE["8"])


def test_hole_hand_power_number_low_card() -> None:
    hand = HoleHand.from_cards(("9h", "3d"))
    assert hand.power_number == RANK_VALUE["9"] / 2


def test_board_basic() -> None:
    board = Board(("2h", "5d", "9c"))
    assert board.num_cards == 3
    assert board.ranks == (RANK_VALUE["2"], RANK_VALUE["5"], RANK_VALUE["9"])
    assert board.high_card == RANK_VALUE["9"]
    assert board.is_paired is False
    assert board.is_monotone is False
    assert board.is_two_tone is False


def test_board_paired() -> None:
    board = Board(("2h", "2d", "9c"))
    assert board.is_paired is True


def test_board_monotone() -> None:
    board = Board(("2h", "5h", "9h"))
    assert board.is_monotone is True
    assert board.is_two_tone is False


def test_board_two_tone() -> None:
    board = Board(("2h", "5h", "9c"))
    assert board.is_two_tone is True
    assert board.is_monotone is False
    assert board.contains_rank(RANK_VALUE["5"])
    assert not board.contains_rank(RANK_VALUE["K"])


def test_hand_evaluation_category() -> None:
    hand = HoleHand.from_cards(("Ah", "Kh"))
    board = Board(("Qh", "Jh", "2c"))
    evaluation = HandEvaluation(hand, board)
    assert evaluation.category() == 0
    assert evaluation.category_name() == "High Card"
    assert evaluation.is_nuts() is False


def test_hand_evaluation_is_nuts() -> None:
    hand = HoleHand.from_cards(("Ah", "Kh"))
    board = Board(("Qh", "Jh", "Th"))
    evaluation = HandEvaluation(hand, board)
    assert evaluation.category() == 8
    assert evaluation.category_name() == "Straight Flush"
    assert evaluation.is_nuts() is True


def test_hand_evaluation_preflop_not_nuts() -> None:
    hand = HoleHand.from_cards(("Ah", "Kh"))
    evaluation = HandEvaluation(hand, Board(()))
    assert evaluation.is_nuts() is False


def main() -> None:
    tests = [
        test_hole_hand_basic,
        test_hole_hand_suited,
        test_hole_hand_pocket_pair,
        test_hole_hand_power_number_low_card,
        test_board_basic,
        test_board_paired,
        test_board_monotone,
        test_board_two_tone,
        test_hand_evaluation_category,
        test_hand_evaluation_is_nuts,
        test_hand_evaluation_preflop_not_nuts,
    ]
    for test in tests:
        test()
        print(f"PASS: {test.__name__}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
