from __future__ import annotations

"""
Uvicorn entrypoint for the Python report agent when running from `update_UI/`.

Run:
  cd update_UI
  uvicorn report_agent_asgi:app --reload --port 8000
"""

import sys
from pathlib import Path

_BACKEND_DIR = (Path(__file__).resolve().parent / "report_backend").resolve()
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.main import app  # noqa: E402,F401
