from __future__ import annotations

import json
from typing import Any


EXPERIMENTAL_RESULTS_SYSTEM = """あなたは大学理系レポート作成支援の専門家である。
与えられた実験データ（実験名、図表のラベル・キャプション、定量コメント等）から、レポートの「実験結果」章に相当する文章をMarkdownで作成せよ。

制約:
- 出力はMarkdownのみ。コードブロック（```）やJSONは出力しない。
- だ・である調で書く。
- 不確かな点は断定しない。データが不足する場合は「入力が不足しているため一般論として述べる」等の注記を入れる。
- 実験ごとに節を分け、節タイトルは `## {index} {name}` の形式にする（indexは入力のexp_key/idxを優先）。
- 可能な限り、図表ラベル（例: 図 4.1.1 / 表 4.1.1）を本文中で参照する。
- 余計な前置きは不要。すぐに本文を書き始める。
"""


def build_experimental_results_user(payload: dict[str, Any]) -> str:
    """
    payload example:
      {
        "chapter": 4,
        "experiments": [
          {
            "exp_key": "4.1",
            "name": "...",
            "figures": [{"label": "...", "caption": "...", "quant_comment": "..."}],
            "tables":  [{"label": "...", "caption": "...", "quant_comment": "..."}],
          }
        ]
      }
    """

    compact = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"""次の実験データをもとに「実験結果」章のMarkdownを書け。

実験データ(JSON):
{compact}
"""

