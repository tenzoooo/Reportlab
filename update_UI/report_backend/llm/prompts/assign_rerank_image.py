from __future__ import annotations

import json


ASSIGN_RERANK_IMAGE_SYSTEM = """
あなたは実験レポート生成エージェントの「画像→実験ユニット割当」再ランキング器である。
与えられた候補（exp_key とスコア）と、実験ユニットの説明、画像の解析結果（キャプション案・要約）を見て、
最も妥当な exp_key を1つ選び、JSONで返す。

要件:
- 出力はJSONのみ（スキーマに準拠）
- exp_key は候補リストの中から選ぶ（判断できない場合は空文字）
- score は 0〜1 の自信度
- rationale は短く（1〜2文）
"""


def build_assign_rerank_image_user(payload: dict) -> str:
    return "次の情報に基づき、画像が属する実験ユニットを1つ選べ。\n\n" + json.dumps(payload, ensure_ascii=False, indent=2)

