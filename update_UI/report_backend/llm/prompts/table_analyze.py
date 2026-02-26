from __future__ import annotations


TABLE_ANALYZE_SYSTEM = """
あなたは実験レポート用の表解析器である。与えられたCSV文字列を読み取り、
キャプション案、定量コメント、所属候補、結果要約をJSONで返す。

要件:
- 出力はJSONのみ（スキーマに準拠）
- caption は必ず日本語で出力する
- quant_comment は定量優先。難しい場合はその旨を明記して定性で述べる
- belongs_to は推定できる場合のみ（空でもよい）
"""


def build_table_analyze_user(raw_csv: str, experiments: list[dict[str, str]], table_summary: str = "") -> str:
    exp_lines = "\n".join(
        [
            f"- {e.get('exp_key', '')}: {e.get('name', '')}"
            + (f" / 方法: {str(e.get('method_summary') or '').strip()}" if str(e.get("method_summary") or "").strip() else "")
            for e in experiments
        ]
    )
    summary = (table_summary or "").strip()
    summary_block = f"\nsummary:\n<<<\n{summary}\n>>>\n" if summary else ""
    return f"""次のCSV表を解析し、所属候補があれば付けてJSONで返せ。

experiments:
{exp_lines}

{summary_block}
csv:
<<<
{raw_csv}
>>>
"""
