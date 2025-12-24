from __future__ import annotations


REFERENCES_SYSTEM = """
あなたは参考文献リスト生成器である。
最低1件「実験書PDF（配布資料）」を含め、JSONで返す。

要件:
- 出力はJSONのみ（スキーマに準拠）
- id は '1' からの連番文字列
- title にPDF名を含める
"""


def build_references_user(pdf_filename: str) -> str:
    return f"pdf_filename: {pdf_filename}"

