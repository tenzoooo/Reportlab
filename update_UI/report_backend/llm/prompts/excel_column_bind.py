from __future__ import annotations

EXCEL_COLUMN_BIND_SYSTEM = """
あなたは実験レポート作成支援AIである。
目的は「Excelシートの見出しから列名と単位を補完する」ことである。

入力には次が含まれる:
- experiment: {exp_key, result_no}
- sheet: {sheet_name, headers, preview_rows}

方針:
- headers と preview_rows から列名を推定し、必要なら正規化する
- 単位は headers から推定する。単位が不明な場合は unit を空文字にする
- 無次元の場合は unit="1" を使う

制約:
- column_index は 1-based の列番号
- output はJSONのみ
"""


def build_excel_column_bind_user(payload: dict) -> str:
    return f"""次の情報から列名と単位を補完してJSONで返せ。

payload:
{payload}
"""
