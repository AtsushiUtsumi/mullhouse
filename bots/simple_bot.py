"""Reference bot for the poker API described at /poker/api-docs.

Creates a 2-player table, joins it, and prints a URL a human can open
in their browser to join as the other seat. Plays a simple
check/call strategy (never bets, never folds) until the table closes.

Usage:
    python simple_bot.py [--base-url http://localhost/api/poker]
                         [--site-url http://localhost] [--name Bot]
                         [--small-blind 25] [--big-blind 50] [--buy-in 1000]

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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost/api/poker")
    parser.add_argument("--site-url", default="http://localhost")
    parser.add_argument("--name", default="吉田のボット")
    parser.add_argument("--small-blind", type=int, default=25)
    parser.add_argument("--big-blind", type=int, default=50)
    parser.add_argument("--buy-in", type=int, default=1000)
    parser.add_argument("--poll-interval", type=float, default=1.0)
    args = parser.parse_args()

    table = request(
        "POST",
        f"{args.base_url}/tables",
        {"name": "日本語の卓名", "small_blind": args.small_blind, "big_blind": args.big_blind, "max_players": 2},
    )
    table_id = table["table_id"]
    print(f"卓を作成しました: {table_id}")

    join = request(
        "POST",
        f"{args.base_url}/tables/{table_id}/join",
        {"display_name": args.name, "buy_in": args.buy_in},
    )
    player_id = join["player_id"]
    token = join["token"]
    print(f"'{args.name}' として着席しました (player_id={player_id})")
    print("ブラウザで下記URLを開いてもう一人のプレイヤーとして参加してください:")
    print(f"  {args.site_url}/poker/{table_id}")
    print("対戦を待機しています... (Ctrl+Cで終了)")

    last_phase = None
    while True:
        payload = request(
            "GET",
            f"{args.base_url}/tables/{table_id}/state?player_id={player_id}&token={token}",
        )
        state = payload["state"]
        if state["phase"] != last_phase:
            seats = [(p["player_id"][:6], p["chips"]) for p in state["players"]]
            print(f"[phase] {state['phase']} pot={state['pot']} players={seats}")
            last_phase = state["phase"]

        if state["status"] == "CLOSED":
            print("卓が終了しました。ボットを終了します。")
            break

        me = next((p for p in state["players"] if p["player_id"] == player_id), None)
        if me is not None and me["chips"] == 0 and payload["rebuy_available"]:
            print("チップがなくなったのでリバイします")
            request(
                "POST",
                f"{args.base_url}/tables/{table_id}/rebuy",
                {"player_id": player_id, "token": token, "buy_in": args.buy_in},
            )

        waiting_for = payload["waiting_for"]
        if waiting_for is not None and waiting_for["player_id"] == player_id:
            action, amount = choose_action(waiting_for)
            print(f"[action] {action}")
            request(
                "POST",
                f"{args.base_url}/tables/{table_id}/action",
                {"player_id": player_id, "token": token, "action": action, "amount": amount},
            )
            continue

        time.sleep(args.poll_interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n中断しました")
        sys.exit(0)
