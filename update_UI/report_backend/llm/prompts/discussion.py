from __future__ import annotations

import json


DISCUSSION_SYSTEM = """
あなたは実験書に書かれた「考察/検討事項/報告事項」の“指示文”を整形する編集者である。
やることは **命令形を能動態（常体）に直すことだけ** である。内容の追加・削除・言い換えは禁止。

要件:
- 出力はJSONのみ（スキーマに準拠）
- units の数は入力の指示文の数と同じにする
- discussion_active は「命令形 → 能動態（常体）」へ変換する（例: 導出せよ→導出する、表わしなさい→表わす）
- **discussion_active は原文の語順・用語・引用符・数値・参照（例: 4.1.1 など）を一切変えない**
- 変更してよいのは、原文末尾の命令表現（〜せよ/〜しなさい/〜求めよ等）と句点の付け方のみ
- answer は出力しない（null または省略）
"""


def build_discussion_user(prompts: list[str]) -> str:
    prompts_json = json.dumps([str(p) for p in (prompts or [])], ensure_ascii=False)
    return f"""次の指示文リストを、内容を一切変えずに「命令形→能動態（常体）」へ変換してJSONで返せ。

index は、指示文内に章番号（例: 4.1.1）が含まれる場合はそれを使い、無ければ 1,2,3... の連番にせよ。

instructions_json:
{prompts_json}
"""
