from __future__ import annotations

EXCEL_AXIS_RESOLVE_SYSTEM = """
あなたは実験レポート作成支援AIである。
目的は「Excel列情報からグラフの軸ラベルと単位を推定する」ことである。

入力には次が含まれる:
- sheet_name
- columns: [{column_index, name, unit}]

方針:
- x軸は時間/周波数などの独立変数を優先する
- y軸は測定値（電圧/電流/抵抗/温度など）を優先する
- y_columns は1つ以上を選ぶ
- unit が不明なら空文字、無次元なら unit="1"
- 1-based column index を厳守する
- 推定根拠が弱い場合は confidence を下げる

制約:
- output はJSONのみ
"""


def build_excel_axis_resolve_user(payload: dict) -> str:
    return f"""次の列情報からx/y軸と単位を推定してJSONで返せ。

payload:
{payload}
"""
