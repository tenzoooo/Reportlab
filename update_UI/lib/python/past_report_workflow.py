import sys
import os
import json
import asyncio
from docx import Document
from openai import AsyncOpenAI

# Local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from past_report_schemas import ReportStructureHint

# Initialize OpenAI Client
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

def read_docx_text(docx_path: str) -> str:
    doc = Document(docx_path)
    full_text = []
    for para in doc.paragraphs:
        if para.text.strip():
            full_text.append(para.text)
    return "\n".join(full_text)

async def extract_hint_with_llm(text: str) -> ReportStructureHint:
    """
    Uses LLM to extract the table/figure structure hint from the past report text.
    """
    system_prompt = """
    あなたは科学実験レポートの分析エキスパートです。
    過去のレポート（テキスト）から、**「実験項目ごとの図表の構成（ヒント）」**を抽出してください。
    
    以下の情報を抽出してください：
    1. **Section**: 実験の大項目（例: "1.1 反転増幅回路..."）。
    2. **Blocks**: そのセクション内で使用されている「表」と「図」のリスト（出現順）。
       - type: "table" または "figure"
       - label: 番号（例: "表1.1.1"）
       - caption: キャプション（例: "反転増幅回路の入出力電圧"）
    
    本文の書き方（style）や手順の詳細は不要です。**「どのセクションに、どんな図表が、いくつあるか」**という構造情報のみを抽出してください。
    出力は提供されたJSONスキーマに厳密に従ってください。
    """
    
    completion = await client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze this report text and extract the table/figure structure:\n\n{text[:30000]}"}
        ],
        response_format=ReportStructureHint,
    )
    
    return completion.choices[0].message.parsed

async def main_async():
    if len(sys.argv) < 2:
        print("Usage: python3 past_report_workflow.py <docx_path>")
        sys.exit(1)
    
    docx_path = sys.argv[1]
    
    try:
        text = read_docx_text(docx_path)
        structure = await extract_hint_with_llm(text)
        print(json.dumps(structure.model_dump(), indent=2, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
