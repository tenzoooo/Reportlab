from __future__ import annotations

import re

from graph.state import AgentState


def test_agent_state_generates_default_job_meta():
    state = AgentState()

    assert state.job_meta.job_id.startswith("studio_")
    assert state.job_meta.job_id.endswith(state.job_meta.run_id)
    assert re.fullmatch(r"[0-9a-f]{32}", state.job_meta.run_id)
