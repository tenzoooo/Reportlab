from typing import List, Literal
from pydantic import BaseModel, Field

class BlockHint(BaseModel):
    type: Literal["table", "figure"]
    label: str = Field(..., description="The label extracted from the report, e.g., '表1.1.1'")
    caption: str = Field(..., description="The caption text, e.g., '反転増幅回路の入出力電圧'")

class SectionHint(BaseModel):
    section_number: str = Field(..., description="Section number, e.g., '1.1'")
    title: str = Field(..., description="Section title, e.g., '反転増幅回路の直流利得特性'")
    blocks: List[BlockHint] = Field(default_factory=list, description="Ordered list of tables and figures in this section")

class ReportStructureHint(BaseModel):
    sections: List[SectionHint] = Field(default_factory=list)
