import sys
import os
import json
import asyncio
from typing import List, Optional, Dict, Any, Union

from pydantic import BaseModel, Field

# ローカルモジュール（既存のAI抽出ワークフロー）を利用
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from past_report_workflow import read_docx_text, extract_hint_with_llm  # type: ignore


class TableItem(BaseModel):
    label: str = Field(..., description="例: 表1.1.1")
    caption: str


class FigureItem(BaseModel):
    label: str = Field(..., description="例: 図1.1.1")
    caption: str


class ExperimentFromReport(BaseModel):
    """
    過去レポートから抽出した1つの実験ユニット。
    ここでは「1.1 反転増幅回路の直流利得特性」のような節単位を1実験とみなす。
    """

    section: str = Field(..., description="節番号, 例: '1.1'")
    idx: int = Field(..., description="大項目連番 (1,2,3,...)")
    subidx: Optional[int] = Field(
        default=None, description="小項目連番。節単位のみの場合は常に null"
    )
    name: str = Field(..., description="節タイトル（節番号＋タイトルを含む）")
    tables: List[TableItem] = Field(default_factory=list)
    figures: List[FigureItem] = Field(default_factory=list)


class ReportExperimentsResult(BaseModel):
    """
    1本のレポートに対する抽出結果。
    """

    chapter: Optional[int] = Field(
        default=None, description="章番号。先頭セクションの '1.1' → 1 などから推定される。"
    )
    experiments: List[ExperimentFromReport] = Field(default_factory=list)


async def extract_experiments_for_text(text: str) -> ReportExperimentsResult:
    """
    レポート全文テキストから、LLM を用いて「節ごとの図表構成ヒント」を抽出し、
    それを experiments 配列へ変換する。
    """
    # 既存の AI 抽出（SectionHint + BlockHint の構造）を利用
    hint = await extract_hint_with_llm(text)

    experiments: List[ExperimentFromReport] = []

    if not hint.sections:
        return ReportExperimentsResult(chapter=None, experiments=experiments)

    # 章番号は最初の section_number の先頭整数から推定
    first_sec = hint.sections[0].section_number
    chapter: Optional[int] = None
    try:
        chapter = int(first_sec.split(".")[0])
    except Exception:
        chapter = None

    # section_number の昇順にソートし、idx を 1,2,3,... と振る
    sorted_sections = sorted(
        hint.sections,
        key=lambda s: tuple(int(p) for p in s.section_number.split(".") if p.isdigit()),
    )

    section_to_idx: Dict[str, int] = {}
    next_idx = 1
    for sec in sorted_sections:
        if sec.section_number not in section_to_idx:
            section_to_idx[sec.section_number] = next_idx
            next_idx += 1

    for sec in sorted_sections:
        idx = section_to_idx[sec.section_number]
        exp = ExperimentFromReport(
            section=sec.section_number,
            idx=idx,
            subidx=None,
            name=f"{sec.section_number} {sec.title}",
            tables=[],
            figures=[],
        )

        for block in sec.blocks:
            if block.type == "table":
                exp.tables.append(TableItem(label=block.label, caption=block.caption))
            elif block.type == "figure":
                exp.figures.append(
                    FigureItem(label=block.label, caption=block.caption)
                )

        experiments.append(exp)

    return ReportExperimentsResult(chapter=chapter, experiments=experiments)


async def _process_path_async(path: str) -> Union[ReportExperimentsResult, Dict[str, Any]]:
    """
    - 単一 DOCX ファイル: ReportExperimentsResult を返す
    - ディレクトリ: 直下の *.docx それぞれに対して結果を返す dict[filename] を返す
    """
    if os.path.isdir(path):
        results: Dict[str, Any] = {}
        for name in sorted(os.listdir(path)):
            if not name.lower().endswith(".docx"):
                continue
            full = os.path.join(path, name)
            text = read_docx_text(full)
            result = await extract_experiments_for_text(text)
            results[name] = result.model_dump()
        return results
    else:
        text = read_docx_text(path)
        result = await extract_experiments_for_text(text)
        return result


async def main_async() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python3 extract_experiments_with_ai.py <docx_path or directory>",
            file=sys.stderr,
        )
        sys.exit(1)

    target = sys.argv[1]

    try:
        result = await _process_path_async(target)
        if isinstance(result, ReportExperimentsResult):
            print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()

