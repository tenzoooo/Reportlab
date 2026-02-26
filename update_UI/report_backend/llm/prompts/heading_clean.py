from __future__ import annotations

import json

from models.contracts import HeadingCleanRequest

HEADING_CLEAN_SYSTEM = """
あなたは実験書PDFの見出し候補を「採用/捨てる/正規化して採用」に分類する。
次の規則を厳密に守れ。

【分類ルール】
- 単独数字・単独記号は見出しではない（noise）。
- 単位・部品値・抵抗値・コンデンサ値などの断片は見出しではない（unit_fragment）。
- 数式断片・軸ラベル・log表記などは見出しではない（formula_fragment）。
- 図表番号だけの断片は見出しではない（table_figure_fragment）。
- 番号表記ゆれは正規化して採用する（例: 4.2.1. -> 4.2.1）。
- 「4：実験方法」のような全角/半角コロンの目次は presentation_outline として採用するが、
  本文構造の抽出には使わない。

【heading_kind】
doc_heading | list_item | table_figure_fragment | formula_fragment | unit_fragment | presentation_outline | noise

【出力形式】
HeadingCleanResponse のJSONのみを出力する。余分な文章は禁止。
"""


def build_heading_clean_user(request: HeadingCleanRequest) -> str:
    payload = json.dumps(request.model_dump(), ensure_ascii=False, indent=2)
    return f"""以下の候補を分類・正規化してJSONで返せ。

候補一覧(JSON):
{payload}
"""
