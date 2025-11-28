from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field

# --- A. 基本部品 (Leaf Nodes) ---

class TableItem(BaseModel):
    label: str = Field(..., description="例: 表5.1")
    caption: str

class FigureItem(BaseModel):
    label: str = Field(..., description="例: 図5.1")
    caption: str

class ReferenceItem(BaseModel):
    id: int
    year: int
    notes: str
    title: str
    authors: str
    publisher: str

class UnitItem(BaseModel):
    """考察の1単位"""
    index: int
    formulas_used: List[str] = Field(default_factory=list)
    reference_ids: List[int]
    formula_numbers: List[str] = Field(default_factory=list)
    discussion_active: str
    missing_formula_numbers: List[str] = Field(default_factory=list)

class ExperimentItem(BaseModel):
    """実験項目（詳細情報含む）"""
    idx: int
    name: str
    subidx: Optional[int] = None
    tables: List[TableItem] = Field(default_factory=list)
    figures: List[FigureItem] = Field(default_factory=list)
    description_brief: str = Field(default="")
    # Intermediate fields for LLM extraction (not part of final output schema but needed for processing)
    condition: Optional[str] = Field(default="", description="実験条件")
    type: Literal["測定", "計算", "分析"] = Field(default="測定", description="実験タイプ")

# --- B. 中間構造 (Composite Nodes) ---

class ConsiderationGroup(BaseModel):
    """JSON内の 'consideration' フィールド用"""
    units: List[UnitItem]
    references: List[ReferenceItem]
    reference_list_formatted: List[str]

# --- C. コアデータ (Core Data Structure) ---

class ResultJson(BaseModel):
    """
    最も重要なデータ本体。
    Difyの 'result_json' キーに対応。
    """
    units: List[UnitItem]
    chapter: int = 5
    summary: str
    references: List[ReferenceItem]
    experiments: List[ExperimentItem]
    total_count: int
    consideration: ConsiderationGroup
    reference_list_formatted: List[str]

# --- D. ラッパー (Wrappers for Dify Compatibility) ---

class OutputWrapper(BaseModel):
    result_json: ResultJson

class RootResponse(BaseModel):
    """
    最終出力JSONのルート定義。
    Difyの仕様により、同じデータが複数の場所に重複して格納される構造を再現。
    """
    units: List[UnitItem]
    output: OutputWrapper
    chapter: int = 5
    outputs: OutputWrapper
    summary: str
    references: List[ReferenceItem]
    experiments: List[ExperimentItem]
    result_json: ResultJson
    total_count: int
    consideration: ConsiderationGroup
    reference_list_formatted: List[str]

# --- LLM Extraction Models (Intermediate) ---

class RawExperimentItem(BaseModel):
    idx: int
    subidx: Optional[int]
    name: str
    condition: str
    type: Literal["測定", "計算", "分析"]

class MethodExtractionResult(BaseModel):
    experiments: List[RawExperimentItem]

class DiscussionResult(BaseModel):
    units: List[UnitItem]
    references: List[ReferenceItem]

class SummaryResult(BaseModel):
    summary: str = Field(..., max_length=340, description="だ・である調、300字程度")
