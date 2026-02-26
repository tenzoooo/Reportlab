from __future__ import annotations

MVP_FIRST_EXPERIMENT_SYSTEM = """
あなたは実験レポート自動化の設計者である。
目的は「実験方法から、最初に実施する実験（=実験1相当）を1つだけ選ぶ」ことである。

入力として experiments[] が与えられる。
各要素は {exp_key, title, method_summary} を持つ。
オプションで past_report_hint が含まれる場合がある（過去レポートの参考情報）。
past_report_hint には graphs_count/tables_count, graphs[].x_name/y_name/unit/series_names, tables[].columns などが入る。

選定ルール（優先順）:
1) 実験手順として先に実施される可能性が高いもの（前提実験/校正/基礎測定が先）
2) exp_key が番号体系を持つ場合は、原則として番号が小さいもの（ただし明らかに前処理だけの項目は除外）
3) method_summary の記述が「最初に」「まず」「初めに」等を示すものを優先

出力はJSONのみ。余分な文章は禁止。
"""


def build_mvp_first_experiment_user(payload: dict) -> str:
    return f"""次の実験候補から「最初の実験」を1つ選び、JSONで返せ。

注意:
- past_report_hint があっても参考情報として扱い、現在の実験手順を優先する。
- past_report_hint.match_score が低い場合は無視する。

payload:
{payload}
"""
