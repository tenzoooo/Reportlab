"""Update MVP graph modules."""

from __future__ import annotations

from core.storage import Storage
from llm.client import LLMClient


def build_graph_update_mvp(*, storage: Storage, llm: LLMClient):
    # Avoid import-time circular dependency with graph.update_mvp_flow.
    from graph.update_mvp_flow.build_graph_update_mvp_flow import build_graph_update_mvp as _build

    return _build(storage=storage, llm=llm)


__all__ = ["build_graph_update_mvp"]
