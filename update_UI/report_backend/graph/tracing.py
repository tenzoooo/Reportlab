from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any, TypeVar

from graph.state import AgentState, ValidationIssue

T = TypeVar("T")


def _is_truthy(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def langsmith_enabled() -> bool:
    override = (os.environ.get("REPORT_AGENT_ENABLE_LANGSMITH") or "").strip().lower()
    if override in {"1", "true", "yes", "y", "on"}:
        return True
    if override in {"0", "false", "no", "n", "off"}:
        return False

    trace_flags = [
        os.environ.get("LANGSMITH_TRACING"),
        os.environ.get("LANGSMITH_TRACING_V2"),
        os.environ.get("LANGCHAIN_TRACING_V2"),
    ]
    explicit = [v.strip() for v in trace_flags if isinstance(v, str) and v.strip()]
    if explicit:
        return any(_is_truthy(v) for v in explicit)
    return bool(os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY"))


def traceable_if_enabled(
    *,
    name: str,
    run_type: str,
    tags: list[str] | None = None,
    process_inputs: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    process_outputs: Callable[[Any], Any] | None = None,
):
    """
    Lightweight wrapper around `langsmith.traceable` that becomes a no-op if tracing is disabled.

    We use this to attach stable, human-friendly names to workflow steps ("agents") without
    depending on LangChain callbacks.
    """

    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        if not langsmith_enabled():
            return fn
        try:
            from langsmith import traceable  # type: ignore
        except Exception:
            return fn

        return traceable(
            name=name,
            run_type=run_type,
            tags=tags,
            process_inputs=process_inputs,
            process_outputs=process_outputs,
        )(fn)

    return decorator


def _summarize_issues(issues: list[ValidationIssue], *, max_items: int = 6) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for issue in issues[:max_items]:
        out.append(
            {
                "code": issue.code,
                "message": issue.message[:200],
                "target": issue.target,
            }
        )
    if len(issues) > max_items:
        out.append({"code": "...", "message": f"+{len(issues) - max_items} more", "target": None})
    return out


def summarize_state_for_trace(state: AgentState | None) -> dict[str, Any]:
    if state is None:
        return {}

    images = state.assets_images or []
    tables = state.assets_tables or []
    experiments = state.experiments or []
    errors = state.validation_report.errors if state.validation_report else []
    warnings = state.validation_report.warnings if state.validation_report else []
    retry_targets = state.validation_report.retry_targets if state.validation_report else []

    return {
        "job_id": state.job_meta.job_id,
        "status": getattr(state.status, "value", str(state.status)),
        "pdf": {
            "filename": state.pdf.filename,
            "pages": state.pdf.pages,
        },
        "counts": {
            "experiments": len(experiments),
            "images": len(images),
            "tables": len(tables),
            "prompts": len(state.pdf.consideration_prompts or []),
            "discussion_units": len(getattr(state.consideration, "units", []) or []),
        },
        "next_action": state.next_action,
        "validation": {
            "errors": _summarize_issues(errors),
            "warnings": _summarize_issues(warnings),
            "retry_targets": _summarize_issues(retry_targets),
        },
        "models": {
            "text_model": state.job_meta.text_model,
            "vision_model": state.job_meta.vision_model,
        },
    }
