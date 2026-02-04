from __future__ import annotations

from pathlib import Path

from core.storage import LocalStorage
from graph.build_graph import build_graph


class _DummyLLM:
    text_model = "dummy"
    vision_model = "dummy"


def test_build_graph_compiles_in_mvp_mode(tmp_path: Path):
    template = Path(__file__).resolve().parents[1] / "templates" / "chapter_fixed_docxtpl_ready.docx"
    storage = LocalStorage(root=tmp_path)
    graph = build_graph(storage=storage, llm=_DummyLLM(), template_path=str(template), mode="mvp")
    assert graph is not None

