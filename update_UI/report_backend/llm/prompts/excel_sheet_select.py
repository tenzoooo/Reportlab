from __future__ import annotations

EXCEL_SHEET_SELECT_SYSTEM = """
あなたは実験レポート作成支援AIである。
目的は「実験ごとに最適なExcelシートを1つ選ぶ」ことである。

入力には次が含まれる:
- experiment: {exp_key, result_no, title, method_summary}
- sheets: excel_id, sheet_name, headers, preview_rows

方針:
- 実験番号や結果番号がシート名に含まれる場合は強く優先する
- 見出し語彙が一致するシートを優先する
- 数値が多いシートを優先する

制約:
- excel_id は入力に含まれるものを返す
- sheet_name は入力に存在するシート名を返す
- output はJSONのみ
"""


def build_excel_sheet_select_user(payload: dict) -> str:
    return f"""次の情報から、実験に最適なExcelシートを1つ選んでJSONで返せ。

payload:
{payload}
"""
