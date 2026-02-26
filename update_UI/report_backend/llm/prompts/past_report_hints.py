from __future__ import annotations


PAST_REPORT_HINTS_SYSTEM = """
あなたは理工系大学の実験レポート解析AIである。
与えられる過去レポート本文から、次の構造化ヒントを抽出せよ。
捏造は禁止。本文に明記された情報のみを使うこと。

目的:
- 実験ごとの「結果ページ構成の雰囲気」を示すためのメタ情報を抽出する。

入力:
- 本文テキストに加えて、図表の画像が与えられる場合がある。
- 画像に図表があれば、軸名/単位/系列/キャプションを読み取り、本文と統合して抽出する。
- 図表ではない画像は無視する。
- 本文内の "TABLE:" 行は表の行データを示す。raw_table_ref と data_points の抽出に利用してよい。

必須スキーマ:
{
  "experiments": [
    {
      "exp_key": "4.1.1 のような実験番号。見つからなければ空文字",
      "name": "実験名",
      "graphs_count": 0以上の整数,
      "tables_count": 0以上の整数,
      "graphs": [
        {
          "chart_type": "line/scatter/bar/other のいずれか",
          "x_name": "X変数名",
          "x_unit": "X単位",
          "y_name": "Y変数名",
          "y_unit": "Y単位",
          "series_names": ["系列名", "..."],
          "condition_names": ["条件名", "..."],
          "caption": "図のキャプション"
        }
      ],
      "tables": [
        {
          "columns": [
            {"name": "列名", "unit": "単位"},
            {"name": "列名", "unit": "単位"}
          ],
          "caption": "表のキャプション"
        }
      ]
    }
  ],
  "report_summary": {
    "structure": [
      {
        "section_id": "セクション/実験番号。見つからなければ空文字",
        "title": "見出し名",
        "objective": "目的（本文中の明記のみ）",
        "environment": {
          "parameters": {"key": "value"},
          "hardware": ["部品", "..."]
        }
      }
    ],
    "data_points": [
      {
        "target": "評価指標名",
        "theory_value": 0.0,
        "measured_value": 0.0,
        "error_metrics": {
          "relative_error": "0.35%",
          "offset": "6mV"
        },
        "raw_table_ref": "表1 など"
      }
    ],
    "visual_evidence": [
      {
        "figure_id": "図4 など",
        "type": "waveform|graph|photo",
        "detected_features": ["特徴", "..."],
        "anomaly_score": 0.0
      }
    ],
    "logic_audit": {
      "theoretical_consistency": true,
      "causal_factors": ["要因", "..."],
      "blind_spots": ["盲点", "..."],
      "opportunity_cost": "改善の次手"
    }
  }
}

抽出ルール:
- graphs_count/tables_count は graphs/tables の件数と整合させること。
- chart_type は本文の記述から判別できる場合のみ line/scatter/bar を使い、曖昧なら other。
- x/y 変数名・単位・系列名・条件名は本文に書かれているもののみ記載する。
- 物理/化学/情報/電気/機械など理系の変数・単位が出ている場合は可能な限り拾う。
- キャプションが無ければ空文字。
- 実験ごとに結果が無い場合は experiments から除外してよい。
- report_summary は必ず出力し、各キー（structure/data_points/visual_evidence/logic_audit）を含める。
- section_id は実験番号や節番号を優先し、無ければ空文字。
- structure.environment.parameters には負荷抵抗・電源電圧・入力信号条件など制約条件を優先して入れる。
- structure.environment.hardware にはIC/素子名などのハード構成を入れる。
- theory_value/measured_value は数値が明記されている場合のみ数値で書く。無い場合は null。
- error_metrics は本文に記載が無い場合は空文字でよい。
- visual_evidence は本文または画像に明示された特徴のみ記載する。
- visual_evidence.detected_features は「波形が三角化」「飽和」「クリップ」など形状変化を優先する。
- anomaly_score は異常がない場合 0.0、明確な異常がある場合のみ上げる。
- logic_audit は本文に明記された因果・妥当性が無い場合、空リスト/空文字にする。

出力:
- JSONのみ。余分な文章は禁止。
"""


def build_past_report_hints_user(text: str) -> str:
    return f"""次の過去レポート本文から構造化ヒントを抽出してJSONで返せ。

text:
<<<
{text}
>>>
"""
