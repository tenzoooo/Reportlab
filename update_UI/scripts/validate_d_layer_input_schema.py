#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable


def _strict_model_base():
    """
    Pydantic v1/v2 compatible strict base (extra fields forbidden).
    """
    try:
        from pydantic import BaseModel, ConfigDict  # type: ignore

        class StrictBaseModel(BaseModel):  # type: ignore[misc]
            model_config = ConfigDict(extra="forbid")

        return StrictBaseModel
    except Exception:
        from pydantic import BaseModel  # type: ignore

        class StrictBaseModel(BaseModel):  # type: ignore[misc]
            class Config:
                extra = "forbid"

        return StrictBaseModel


StrictBaseModel = _strict_model_base()

try:
    from pydantic import Field  # type: ignore
except Exception as e:  # pragma: no cover
    raise SystemExit(f"[FATAL] pydantic is required: {e}")

# Ensure we can import `graph.*` regardless of current working directory.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_REPORT_BACKEND_DIR = _REPO_ROOT / "report_backend"
if _REPORT_BACKEND_DIR.exists():
    sys.path.insert(0, str(_REPORT_BACKEND_DIR))
    os.environ.setdefault("PYTHONPATH", str(_REPORT_BACKEND_DIR))

# Reuse canonical schema objects where possible to avoid drift.
from graph.state import ExperimentUnit, LLMTheoryFormula  # type: ignore


class ExperimentRef(StrictBaseModel):
    exp_key: str
    title: str
    method_text: str = ""
    parent: dict[str, Any] | None = None


class PastReportExperiment(StrictBaseModel):
    exp_key: str = ""
    title: str = ""
    section_text: str = ""
    heading_line: str = ""


class ExcelFileRef(StrictBaseModel):
    excel_id: str = ""
    filename: str = ""
    storage_key: str = ""


class ExcelSheetRef(StrictBaseModel):
    sheet_name: str = ""
    headers: list[str] = Field(default_factory=list)
    numeric_density: float = 0.0


class ExcelInventoryRef(StrictBaseModel):
    excel_id: str = ""
    filename: str = ""
    sheets: list[ExcelSheetRef] = Field(default_factory=list)


class PastReportHeading(StrictBaseModel):
    heading_line: str = ""
    title: str = ""
    section_text: str = ""
    page_image_paths: list[str] = Field(default_factory=list)
    exp_key: str = ""


class DLayerInputPayload(StrictBaseModel):
    """
    Schema for JSON emitted by report_backend/tools/build_d_layer_input.py
    """

    exp_key: str
    experiment: ExperimentRef
    past_report_experiments: list[PastReportExperiment] = Field(default_factory=list)
    excel_files: list[ExcelFileRef] = Field(default_factory=list)
    excel_sheets: list[ExcelInventoryRef] = Field(default_factory=list)
    theory_formulas: list[LLMTheoryFormula] = Field(default_factory=list)
    experiment_unit: ExperimentUnit
    past_report_heading: list[PastReportHeading] = Field(default_factory=list)


def _iter_input_files(paths: Iterable[str]) -> list[Path]:
    out: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            out.extend(sorted(p.glob("d_layer_input_*.json")))
            continue
        out.append(p)
    return out


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_file(path: Path) -> tuple[bool, str]:
    try:
        raw = _load_json(path)
    except Exception as e:
        return False, f"[FAIL] {path}: invalid JSON ({e})"

    try:
        # Pydantic v2
        if hasattr(DLayerInputPayload, "model_validate"):
            DLayerInputPayload.model_validate(raw)  # type: ignore[attr-defined]
        else:
            DLayerInputPayload.parse_obj(raw)  # type: ignore[attr-defined]
    except Exception as e:
        return False, f"[FAIL] {path}: schema mismatch ({e})"

    return True, f"[PASS] {path}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate D-layer input JSON schema (strict, no extra fields)."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=[],
        help="JSON file paths or directories. If empty, defaults to tmp_state_outputs/d_layer_input_*.json",
    )
    args = parser.parse_args()

    paths = list(args.paths or [])
    if not paths:
        paths = ["tmp_state_outputs"]

    files = _iter_input_files(paths)
    if not files:
        print("[WARN] No d_layer_input_*.json found.")
        return 2

    ok_all = True
    for f in files:
        ok, msg = validate_file(f)
        print(msg)
        ok_all = ok_all and ok

    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
