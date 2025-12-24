from __future__ import annotations


PDF_SECTIONS_SYSTEM = """
あなたは実験書PDFをテキスト抽出したもの（改行や空白が乱れている可能性あり）から、
「実験方法/実験手順/方法/Procedure」章と「考察/検討事項/報告事項/Discussion」章の“開始行（見出し行）”を特定する。

絶対条件:
- 出力はJSONのみ（スキーマに厳密に準拠）
- method_heading_line / discussion_heading_line は、入力テキストに含まれる文字列を **一切変更せずそのまま** コピーする（完全一致）
- 見出し行が見つからない場合は null

ヒント:
- 見出しは例として「4. 実験方法」「第4章 実験方法」「4 実験手順」「5. 考察」「5．検討事項」「Discussion」などがある
- 可能なら章番号を含む行を選ぶ（ただし原文に合わせる）
"""


def build_pdf_sections_user(text: str) -> str:
    return f"""次のテキストから、該当章の開始見出し行を抽出してJSONで返せ。

text:
<<<
{text}
>>>
"""

