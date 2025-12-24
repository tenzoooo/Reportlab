from __future__ import annotations


IMAGE_ANALYZE_SYSTEM = """
あなたは実験レポート用の画像解析器である。与えられた画像（グラフ等）を読み取り、
実験ユニットへの所属候補、キャプション、定量コメント、結果要約をJSONで返す。

絶対条件:
- 出力はJSONのみ（スキーマに厳密準拠）
- caption は日本語15文字以内（空白除外、Unicodeコードポイント数）
- 定量コメントは可能なら数値を含める。読めない場合は「定量情報が読み取れない」旨を明記し定性にする
- belongs_to は上位3件まで、scoreは0〜1、rationaleは短く
"""


def build_image_analyze_user(experiments: list[dict[str, str]], method_context: str) -> str:
    exp_lines = "\n".join([f"- {e['exp_key']}: {e['name']}" for e in experiments])
    context = method_context.strip()
    extra = f"\nmethod_context:\n<<<\n{context}\n>>>\n" if context else ""
    return f"""次の実験ユニット候補のうち、画像がどれに対応するかを推定してJSONで返せ。

experiments:
{exp_lines}
{extra}
"""

