"""Fills a table with CPU players and waits for humans to join.

Creates a table with a fixed initial buy-in and ante schedule, seats a
configurable number of CPU players (leaving room for humans), then keeps
polling and acting for every CPU seat with a simple check/call strategy
until the table closes.

Usage:
    python table_bot.py [--base-url http://localhost/api/poker]
                        [--site-url http://localhost]
                        [--table-name テスト卓] [--small-blind 25] [--big-blind 50]
                        [--max-players 6] [--initial-chips 15000]
                        [--ante-schedule 70,140,280,410] [--num-bots 5]
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


def choose_action(waiting_for: dict) -> tuple[str, int | None]:
    actions = waiting_for["valid_actions"]
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


def parse_int_list(text: str) -> list[int]:
    return [int(part.strip()) for part in text.split(",") if part.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost/api/poker")
    parser.add_argument("--site-url", default="http://localhost")
    parser.add_argument("--table-name", default="テスト卓")
    parser.add_argument("--small-blind", type=int, default=25)
    parser.add_argument("--big-blind", type=int, default=50)
    parser.add_argument("--max-players", type=int, default=6)
    parser.add_argument("--initial-chips", type=int, default=500)
    parser.add_argument("--ante-schedule", default="70,140,280,410")
    parser.add_argument("--num-bots", type=int, default=5)
    parser.add_argument("--bot-name-prefix", default="CPU")
    parser.add_argument("--poll-interval", type=float, default=1.0)
    parser.add_argument("--allow-rebuy", action=argparse.BooleanOptionalAction, default=False)
    args = parser.parse_args()

    ante_schedule = parse_int_list(args.ante_schedule)

    table = request(
        "POST",
        f"{args.base_url}/tables",
        {
            "name": args.table_name,
            "small_blind": args.small_blind,
            "big_blind": args.big_blind,
            "max_players": args.max_players,
            "ante_schedule": ante_schedule,
            "require_full_table": True,
            "initial_chips": args.initial_chips,
            "allow_rebuy": args.allow_rebuy,
        },
    )
    table_id = table["table_id"]
    print(f"卓を作成しました: '{args.table_name}' (table_id={table_id})")
    print(f"  SB/BB={args.small_blind}/{args.big_blind}  初期チップ={args.initial_chips}  アンティ={ante_schedule}  リバイ={'許可' if args.allow_rebuy else '禁止'}")

    bots: list[BotPlayer] = []
    for i in range(1, args.num_bots + 1):
        name = f"{args.bot_name_prefix}{i}"
        join = request(
            "POST",
            f"{args.base_url}/tables/{table_id}/join",
            {"display_name": name, "buy_in": args.initial_chips},
        )
        bots.append(BotPlayer(name, join["player_id"], join["token"]))
        print(f"'{name}' として着席しました (player_id={join['player_id']})")

    remaining = args.max_players - len(bots)
    print(f"{len(bots)}/{args.max_players}人のCPUが着席しました。残り{remaining}人の参加を待っています。")
    print("ブラウザで下記URLを開いて参加してください:")
    print(f"  {args.site_url}/poker/{table_id}")
    print("対戦を待機しています... (Ctrl+Cで終了)")

    while True:
        any_active = False
        for bot in bots:
            payload = request(
                "GET",
                f"{args.base_url}/tables/{table_id}/state?player_id={bot.player_id}&token={bot.token}",
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
                    f"{args.base_url}/tables/{table_id}/rebuy",
                    {"player_id": bot.player_id, "token": bot.token, "buy_in": args.initial_chips},
                )

            waiting_for = payload["waiting_for"]
            if waiting_for is not None and waiting_for["player_id"] == bot.player_id:
                action, amount = choose_action(waiting_for)
                print(f"[{bot.name}] action={action}")
                request(
                    "POST",
                    f"{args.base_url}/tables/{table_id}/action",
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
