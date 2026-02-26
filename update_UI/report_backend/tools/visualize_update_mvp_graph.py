"""Helpers for rendering the update_mvp agent graph in interactive sessions."""

from __future__ import annotations

from pathlib import Path
from core.storage import LocalStorage
from update_UI.report_backend.graph.update_mvp_flow.build_graph_update_mvp_flow import (
    build_graph_update_mvp,
)


class _DummyLLM:
    text_model: str = "dummy"
    vision_model: str = "dummy"


StorageRoot = Path | str | None


def _resolve_root(root: StorageRoot) -> Path:
    """Anchor LocalStorage to a predictable location to avoid impure state."""

    resolved_root = Path(root or ".").resolve()
    # Why: graph compilation only sketches structure, so a stable, non-existent directory avoids accidental writes.
    return resolved_root


def compile_update_mvp_graph(root: StorageRoot = None):
    """
    Build the compiled StateGraph that describes the update_mvp agent flow.
    """

    storage_root = _resolve_root(root)
    storage = LocalStorage(root=storage_root)
    return build_graph_update_mvp(storage=storage, llm=_DummyLLM())


def update_mvp_mermaid(root: StorageRoot = None) -> str:
    """
    Return the Mermaid definition so IPython users can inspect node/edge labels textually.
    """

    graph = compile_update_mvp_graph(root=root)
    return graph.get_graph().draw_mermaid()


def display_update_mvp_graph(root: StorageRoot = None):
    """
    Render the compiled update_mvp workflow as a PNG image suitable for `IPython.display`.
    """

    graph = compile_update_mvp_graph(root=root)

    try:
        from IPython.display import Image as IPythonImage  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "IPython is required to render the update_mvp workflow visually."
        ) from exc

    # Why: returning an Image keeps the helper lightweight and reusable inside notebooks.
    return IPythonImage(graph.get_graph().draw_mermaid_png())
