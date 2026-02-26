from __future__ import annotations

import os
from pathlib import Path

from core.config import load_settings
from core.storage import LocalStorage
from graph.update_mvp_flow.build_graph_update_mvp_flow import build_graph_update_mvp
from llm.client import LLMClient


def _storage_root() -> Path:
    root = os.environ.get("REPORT_BACKEND_STORAGE_DIR", ".langgraph_storage")
    return Path(root).expanduser().resolve()


def _build_storage() -> LocalStorage:
    root = _storage_root()
    root.mkdir(parents=True, exist_ok=True)
    return LocalStorage(root=root)


def _build_llm() -> LLMClient:
    return LLMClient(load_settings())


def build_graph():
    storage = _build_storage()
    llm = _build_llm()
    return build_graph_update_mvp(storage=storage, llm=llm)


graph = build_graph()

__all__ = ["graph", "build_graph"]
