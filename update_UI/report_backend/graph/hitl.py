from __future__ import annotations

import os


def _is_truthy(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def hitl_disabled() -> bool:
    """
    When true, the agent will not stop for HITL (human-in-the-loop) confirmation.

    Why:
    - Used for dev/diagnostics to force the pipeline to complete end-to-end once,
      even when ambiguity gates would normally block.
    - This is a behavior override and must be explicit via env var.
    """

    return _is_truthy(os.environ.get("REPORT_AGENT_DISABLE_HITL"))


__all__ = ["hitl_disabled"]

