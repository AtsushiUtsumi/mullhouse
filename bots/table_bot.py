"""Fills a table with CPU players and waits for humans to join.

Creates a table with a fixed initial buy-in and ante schedule, seats a
configurable number of CPU players (leaving room for humans), then keeps
polling and acting for every CPU seat with a simple check/call strategy
until the table closes.

Usage:
    python table_bot.py [--host 18.182.161.71 | --host localhost]
                        [--base-url http://18.182.161.71/api/poker]  # host を上書き
                        [--site-url http://18.182.161.71]            # host を上書き
                        [--table-name テスト卓]
                        [--max-players 6] [--initial-chips 15000]
                        [--level-schedule 25/50/70,25/50/140,25/50/280,25/50/410] [--num-bots 5]
                        [--allow-rebuy | --no-allow-rebuy]

No third-party dependencies; uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def request(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} -> {e.code}: {detail}") from e


_RANK_VALUES = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
}


def is_odd_rank(card: str) -> bool:
    return _RANK_VALUES[card[0]] % 2 == 1


def clamp_bet_amount(state: dict, me: dict, amount: float) -> int | None:
    max_amount = me["current_bet"] + me["chips"]
    # Doubling current_bet always covers the true minimum raise (the required increment
    # can never exceed current_bet itself), so it's a safe floor without needing the
    # engine's exact min-raise increment.
    min_amount = max(state["big_blind"], state["current_bet"] * 2)
    if max_amount < min_amount:
        # 手持ちチップ全額を賭けても最小レイズに届かない場合、エンジンはショートオールインの
        # レイズを許容しない(Raiseは常にcurrent_bet*2以上が必須)ため、レイズ自体を諦める。
        return None
    return int(min(max(round(amount), min_amount), max_amount))


def choose_action(waiting_for: dict, me: dict, state: dict) -> tuple[str, int | None]:
    actions = waiting_for["valid_actions"]
    hole_cards = me.get("hole_cards") or []

    # 自分のホールカード2枚がどちらも奇数ランクなら、ポットの33%レイズ(またはベット)を狙う
    if len(hole_cards) == 2 and all(is_odd_rank(c) for c in hole_cards):
        raise_action = "raise" if "raise" in actions else ("bet" if "bet" in actions else None)
        if raise_action is not None:
            amount = clamp_bet_amount(state, me, state["pot"] * 0.33)
            if amount is not None:
                return raise_action, amount

    if "check" in actions:
        return "check", None
    if "call" in actions:
        return "call", None
    return "fold", None


class BotPlayer:
    def __init__(self, name: str, player_id: str, token: str) -> None:
        self.name = name
        self.player_id = player_id
        self.token = token
        self.last_phase: str | None = None


def parse_level_schedule(text: str) -> list[tuple[int, int, int]]:
    levels = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        sb, bb, ante = (int(n.strip()) for n in part.split("/"))
        levels.append((sb, bb, ante))
    return levels


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="18.182.161.71", help="対象ホスト (例: localhost)")
    parser.add_argument("--base-url", default=None, help="省略時は http://{host}/api/poker")
    parser.add_argument("--site-url", default=None, help="省略時は http://{host}")
    parser.add_argument("--table-name", default="テスト卓")
    parser.add_argument("--max-players", type=int, default=6)
    parser.add_argument("--initial-chips", type=int, default=500)
    parser.add_argument("--level-schedule", default="25/50/70,25/50/140,25/50/280,25/50/410")
    parser.add_argument("--num-bots", type=int, default=5)
    parser.add_argument("--bot-name-prefix", default="CPU")
    parser.add_argument("--poll-interval", type=float, default=1.0)
    parser.add_argument("--think-seconds", type=float, default=1.0, help="手番になってからアクションを送るまでの思考時間(秒)")
    parser.add_argument("--allow-rebuy", action=argparse.BooleanOptionalAction, default=False)
    args = parser.parse_args()

    base_url = args.base_url or f"http://{args.host}/api/poker"
    site_url = args.site_url or f"http://{args.host}"
    level_schedule = parse_level_schedule(args.level_schedule)

    table = request(
        "POST",
        f"{base_url}/tables",
        {
            "name": args.table_name,
            "max_players": args.max_players,
            "level_schedule": level_schedule,
            "require_full_table": True,
            "initial_chips": args.initial_chips,
            "allow_rebuy": args.allow_rebuy,
        },
    )
    table_id = table["table_id"]
    print(f"卓を作成しました: '{args.table_name}' (table_id={table_id})")
    print(f"  初期チップ={args.initial_chips}  レベルスケジュール={level_schedule}  リバイ={'許可' if args.allow_rebuy else '禁止'}")

    bots: list[BotPlayer] = []
    for i in range(1, args.num_bots + 1):
        name = f"{args.bot_name_prefix}{i}"
        join = request(
            "POST",
            f"{base_url}/tables/{table_id}/join",
            {"display_name": name, "buy_in": args.initial_chips},
        )
        bots.append(BotPlayer(name, join["player_id"], join["token"]))
        print(f"'{name}' として着席しました (player_id={join['player_id']})")

    remaining = args.max_players - len(bots)
    print(f"{len(bots)}/{args.max_players}人のCPUが着席しました。残り{remaining}人の参加を待っています。")
    print("ブラウザで下記URLを開いて参加してください:")
    print(f"  {site_url}/poker/{table_id}")
    print("対戦を待機しています... (Ctrl+Cで終了)")

    while True:
        any_active = False
        for bot in bots:
            payload = request(
                "GET",
                f"{base_url}/tables/{table_id}/state?player_id={bot.player_id}&token={bot.token}",
            )
            state = payload["state"]
            if state["phase"] != bot.last_phase:
                seats = [(p["player_id"][:6], p["chips"]) for p in state["players"]]
                print(f"[{bot.name}] phase={state['phase']} pot={state['pot']} players={seats}")
                bot.last_phase = state["phase"]

            if state["status"] == "CLOSED":
                continue
            any_active = True

            me = next((p for p in state["players"] if p["player_id"] == bot.player_id), None)
            if me is not None and me["chips"] == 0 and payload["rebuy_available"]:
                print(f"[{bot.name}] チップがなくなったのでリバイします")
                request(
                    "POST",
                    f"{base_url}/tables/{table_id}/rebuy",
                    {"player_id": bot.player_id, "token": bot.token, "buy_in": args.initial_chips},
                )

            waiting_for = payload["waiting_for"]
            if waiting_for is not None and waiting_for["player_id"] == bot.player_id:
                time.sleep(args.think_seconds)
                action, amount = choose_action(waiting_for, me, state)
                print(f"[{bot.name}] action={action}" + (f" amount={amount}" if amount is not None else ""))
                request(
                    "POST",
                    f"{base_url}/tables/{table_id}/action",
                    {"player_id": bot.player_id, "token": bot.token, "action": action, "amount": amount},
                )

        if not any_active:
            print("卓が終了しました。ボットを終了します。")
            break

        time.sleep(args.poll_interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n中断しました")
        sys.exit(0)
