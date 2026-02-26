from __future__ import annotations

import argparse
import os
import sys
from openai import OpenAI


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simple OpenAI API connectivity test.")
    parser.add_argument(
        "--model",
        default="gpt-5-nano",
        help="Model name to call (default: gpt-5-nano)",
    )
    parser.add_argument(
        "--prompt",
        default="API接続テストです。3語以内で応答してください。",
        help="Prompt text to send",
    )
    parser.add_argument(
        "--max-completion-tokens",
        type=int,
        default=256,
        help="max_completion_tokens for chat completion",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set.", file=sys.stderr)
        return 2

    client = OpenAI(api_key=api_key)
    response = client.responses.create(
        model=args.model,
        input=[
            {"role": "system", "content": "You are a concise assistant."},
            {"role": "user", "content": args.prompt},
        ],
        max_output_tokens=args.max_completion_tokens,
    )
    text = response.output_text or ""
    print(f"model={args.model}")
    if text:
        print(f"response={text}")
    else:
        print("response=<empty>")
        print(f"raw_response={response.model_dump_json()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
