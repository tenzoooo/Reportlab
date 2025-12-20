import asyncio
import sys
import json
import os
import fitz  # PyMuPDF
from openai import AsyncOpenAI
from typing import List, Dict, Any
import argparse

# Local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from schemas import (
    MethodExtractionResult,
    DiscussionResult,
    SummaryResult,
    RootResponse,
    ExperimentItem,
    UnitItem,
    TableItem,
    FigureItem,
    ReferenceItem,
    ConsiderationGroup,
    ResultJson,
    OutputWrapper
)
from smart_splitter import SmartSplitter

# Initialize AsyncOpenAI Client
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

class LabReportBuilder:
    def __init__(self, chapter: int = 5):
        self.chapter = chapter

    def build_experiments(self, raw_experiments: list) -> List[ExperimentItem]:
        """LLMの抽出結果から、図表番号と説明文を生成して構造化する"""
        results = []
        t_cnt = 1
        f_cnt = 1

        for exp in raw_experiments:
            # 必須フィールドの取得
            name = exp.name
            cond = exp.condition
            e_type = exp.type
            
            tables = []
            figures = []
            
            # 1. 表の生成
            # LLMが抽出したキャプションがあればそれを使う
            if exp.table_captions:
                for cap in exp.table_captions:
                    t_lbl = f"表{self.chapter}.{t_cnt}"
                    tables.append(TableItem(label=t_lbl, caption=cap))
                    t_cnt += 1
            # なければ、タイプに応じてデフォルト生成 (後方互換性)
            elif e_type in ["測定", "分析"]:
                t_lbl = f"表{self.chapter}.{t_cnt}"
                tables.append(TableItem(label=t_lbl, caption=f"{name}"))
                t_cnt += 1

            # 2. 図の生成
            # LLMが抽出したキャプションがあればそれを使う
            if exp.figure_captions:
                for cap in exp.figure_captions:
                    f_lbl = f"図{self.chapter}.{f_cnt}"
                    figures.append(FigureItem(label=f_lbl, caption=cap))
                    f_cnt += 1
            # なければ、デフォルト生成
            else:
                f_lbl = f"図{self.chapter}.{f_cnt}"
                figures.append(FigureItem(label=f_lbl, caption=f"{name}"))
                f_cnt += 1

            # 3. 説明文の生成
            # 生成された図表ラベルを収集
            t_labels = [t.label for t in tables]
            f_labels = [f.label for f in figures]
            
            ref_str = ""
            if t_labels and f_labels:
                # 表と図の両方がある場合
                if len(t_labels) == 1:
                    t_ref = t_labels[0]
                else:
                    t_ref = f"{t_labels[0]}〜{t_labels[-1]}"
                
                if len(f_labels) == 1:
                    f_ref = f_labels[0]
                else:
                    f_ref = f"{f_labels[0]}〜{f_labels[-1]}"
                
                ref_str = f"{t_ref}および{f_ref}"
            elif t_labels:
                # 表のみ
                if len(t_labels) == 1:
                    ref_str = t_labels[0]
                else:
                    ref_str = f"{t_labels[0]}〜{t_labels[-1]}"
            elif f_labels:
                # 図のみ
                if len(f_labels) == 1:
                    ref_str = f_labels[0]
                else:
                    ref_str = f"{f_labels[0]}〜{f_labels[-1]}"

            if e_type == "測定":
                desc = f"{name}において、{cond}の条件で測定した結果を{ref_str}に示す。"
            elif e_type == "分析":
                desc = f"{name}の結果を整理して表を作成し、求めた結果を{ref_str}に示す。"
            else:
                desc = f"{name}を計算した結果を{ref_str}に示す。"

            # ExperimentItemの作成
            item = ExperimentItem(
                idx=exp.idx,
                subidx=exp.subidx,
                name=name,
                tables=tables,
                figures=figures,
                description_brief=desc,
                condition=cond,
                type=e_type
            )
            results.append(item)
            
        return results

    def assemble_final_json(self, summary: str, units: list, experiments: list, refs: list, method_text: str = "", method_heading: str = "") -> str:
        """全パーツを結合してDify互換JSONを出力"""

        # 1. 参考文献の整形
        ref_formatted = [
            f"[{r.id}]{r.authors} {r.title} {r.publisher} {r.year}" 
            for r in refs
        ]
        
        # 2. Considerationグループ作成
        consideration = ConsiderationGroup(
            units=units,
            references=refs,
            reference_list_formatted=ref_formatted
        )

        # 3. Core Data作成
        core = ResultJson(
            units=units,
            chapter=self.chapter,
            summary=summary,
            references=refs,
            experiments=experiments,
            total_count=len(units),
            consideration=consideration,
            reference_list_formatted=ref_formatted,
            method_text=method_text,
            method_heading=method_heading
        )

        # 4. Root Wrapper作成 (完全再現)
        root = RootResponse(
            units=units,
            output=OutputWrapper(result_json=core),
            chapter=self.chapter,
            outputs=OutputWrapper(result_json=core),
            summary=summary,
            references=refs,
            experiments=experiments,
            result_json=core,
            total_count=len(units),
            consideration=consideration,
            reference_list_formatted=ref_formatted,
            method_text=method_text,
            method_heading=method_heading
        )

        return root.model_dump_json(indent=2)

async def extract_text_from_pdf(pdf_path: str) -> str:
    """Extracts text from PDF using PyMuPDF (fitz)."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        # Simple text extraction for now.
        text += page.get_text()
    return text


def extract_text_from_docx(docx_path: str) -> str:
    """Extracts text from DOCX using python-docx."""
    from docx import Document  # lazy import to keep dependency local

    doc = Document(docx_path)
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(parts)


async def extract_text_from_file(path: str) -> str:
    """
    Unified entry: PDF or DOCX を扱う。
    拡張子で判定し、未知の拡張子の場合はエラーを投げる。
    """
    lower = path.lower()
    if lower.endswith(".pdf"):
        return await extract_text_from_pdf(path)
    if lower.endswith(".docx"):
        return extract_text_from_docx(path)
    raise ValueError(f"Unsupported file type for analysis: {path}")

async def generate_summary(text: str) -> SummaryResult:
    """Task C: 全体要約 (Summary Generation)"""
    completion = await client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": "あなたは優秀な理系学生です。実験レポートの「まとめ」を作成してください。"},
            {"role": "user", "content": f"以下の実験テキストから、300字程度の「まとめ」を作成してください。文体は「だ・である」調、過去形としてください。目的・理論・手順・結論を簡潔にまとめてください。\n\n{text}"}
        ],
        response_format=SummaryResult,
    )
    return completion.choices[0].message.parsed

async def extract_methods(text: str) -> MethodExtractionResult:
    """Task A: 実験構造の抽出 (Structure Extraction)"""
    completion = await client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": "あなたは優秀な理系学生です。実験レポートの「実験方法」セクションから、実験手順を構造化して抽出してください。"},
            {"role": "user", "content": f"以下の「実験方法」テキストから、実験項目を抽出してください。\n各項目の『階層（idx, subidx）』、『名称(name)』、『実験タイプ（type: 測定/計算/分析）』、『条件（condition: IB=20μAなど）』を抽出してください。\nまた、文脈から判断して、その実験項目に対して作成すべき『表のキャプションリスト(table_captions)』と『図のキャプションリスト(figure_captions)』も抽出してください。\n例: 測定データと計算結果の表が必要なら table_captions=['測定データ', '計算結果'] とする。\n\n{text}"}
        ],
        response_format=MethodExtractionResult,
    )
    return completion.choices[0].message.parsed

async def normalize_discussion(text: str) -> DiscussionResult:
    """Task B: 考察課題の正規化 (Discussion Normalization)"""
    completion = await client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": "あなたは優秀な理系学生です。実験レポートの「考察」セクションを正規化してください。"},
            {"role": "user", "content": f"以下の「考察」テキストを正規化・構造化してください。\n課題（6.1, 6.2...）ごとに分割し、文中の『考察せよ』等の命令形を『考察する』等の常体・能動態に書き換えてください(discussion_active)。\n\n{text}"}
        ],
        response_format=DiscussionResult,
    )
    return completion.choices[0].message.parsed

async def main():
    parser = argparse.ArgumentParser(description="Optimized Document Processing Workflow (PDF/DOCX)")
    parser.add_argument("file_path", help="Path to the PDF or DOCX file")
    args = parser.parse_args()
    
    if not os.path.exists(args.file_path):
        print(json.dumps({"error": "File not found"}))
        sys.exit(1)

    try:
        # 1. Extract Text
        full_text = await extract_text_from_file(args.file_path)
        
        # 2. Smart Split
        splitter = SmartSplitter()
        contexts = splitter.split(full_text)
        
        # 3. Parallel Execution (Async LLM)
        task_summary = generate_summary(contexts.full_text)
        task_methods = extract_methods(contexts.method_text)
        task_discussion = normalize_discussion(contexts.discussion_text)
        
        summary_res, methods_res, discussion_res = await asyncio.gather(
            task_summary,
            task_methods,
            task_discussion
        )
        
        # 4. Deterministic Post-Processing (Phase 3 & 4)
        builder = LabReportBuilder(chapter=5)
        
        # Build experiments with auto-numbering and templates
        structured_experiments = builder.build_experiments(methods_res.experiments)
        
        # Assemble final JSON
        final_json_str = builder.assemble_final_json(
            summary=summary_res.summary,
            units=discussion_res.units,
            experiments=structured_experiments,
            refs=discussion_res.references,
            method_text=contexts.method_text,
            method_heading=""
        )
        
        # Output JSON to stdout
        print(final_json_str)
        
    except Exception as e:
        # Error handling
        error_response = {"error": str(e)}
        print(json.dumps(error_response, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
