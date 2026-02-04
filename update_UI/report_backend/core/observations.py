from __future__ import annotations

from typing import Any


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except Exception:
        return None


def _nearest_point(points: list[tuple[float, float]], x0: float) -> tuple[float, float] | None:
    if not points:
        return None
    return min(points, key=lambda p: abs(p[0] - x0))


def build_xy_observations(
    *,
    experiment_key: str,
    experiment_title: str,
    x_name: str,
    x_unit: str,
    y_name: str,
    y_unit: str,
    driver: dict[str, object] | None,
    series: list[dict[str, Any]],
    probe_x: float | None = None,
    region_x_min: float | None = None,
) -> dict[str, Any]:
    """
    Build structured, JSON-serializable observations for an XY result with multiple series.

    IMPORTANT:
    - This function must not generate any natural-language quantitative sentences.
    - It only computes numerical facts + flags for downstream LLM writing.
    """
    x_name_s = str(x_name or "X").strip() or "X"
    y_name_s = str(y_name or "Y").strip() or "Y"
    x_unit_s = str(x_unit or "").strip()
    y_unit_s = str(y_unit or "").strip()

    all_points: list[tuple[float, float]] = []
    for s in series[:8]:
        pts = s.get("points") if isinstance(s.get("points"), list) else []
        for p in pts:
            if not (isinstance(p, tuple) and len(p) == 2):
                continue
            x = _as_float(p[0])
            y = _as_float(p[1])
            if x is None or y is None:
                continue
            all_points.append((x, y))

    xs = [p[0] for p in all_points]
    min_x = min(xs) if xs else None
    max_x = max(xs) if xs else None

    # Choose defensible probe/region thresholds from data (no invention):
    # - prefer x≈1.0 when the unit is V and 1.0 is within observed range
    # - otherwise use the median observed x
    if probe_x is None:
        if x_unit_s.lower() == "v" and min_x is not None and max_x is not None and (min_x <= 1.0 <= max_x):
            probe_x = 1.0
        elif xs:
            xs_sorted = sorted(xs)
            probe_x = xs_sorted[len(xs_sorted) // 2]
        else:
            probe_x = 0.0
    if region_x_min is None:
        region_x_min = probe_x

    driver_out: dict[str, object] = {}
    if driver and isinstance(driver.get("name"), str) and isinstance(driver.get("unit"), str) and isinstance(driver.get("values"), list):
        vals = [_as_float(v) for v in (driver.get("values") or [])]
        vals2 = [v for v in vals if v is not None]
        if len(vals2) >= 2:
            driver_out = {
                "name": str(driver.get("name") or "").strip(),
                "unit": str(driver.get("unit") or "").strip(),
                "min": min(vals2),
                "max": max(vals2),
                "values": vals2,
            }

    payload: dict[str, Any] = {
        "experiment": {"exp_key": str(experiment_key or "").strip(), "title": str(experiment_title or "").strip()},
        "variables": {
            "x": {"name": x_name_s, "unit": x_unit_s},
            "y": {"name": y_name_s, "unit": y_unit_s},
            "driver": driver_out,
        },
        "probe": {"x": float(probe_x), "region_min_x": float(region_x_min)},
        "series": [],
        "missing_data": {"has_missing": False, "total_missing_points": 0, "examples": []},
        "allowed_scope": ["numerical_observation", "variation_degree", "missing_data_note", "limited_evaluation"],
        "forbidden_terms": [
            "能動領域",
            "飽和領域",
            "Early効果",
            "アーリー効果",
            "線形性",
            "カットオフ",
            "hFE",
            "β",
            "α",
        ],
    }

    missing_examples: list[str] = []
    total_missing = 0

    for s in series[:8]:
        name = str(s.get("name") or "").strip()
        pts = s.get("points") if isinstance(s.get("points"), list) else []
        pts2: list[tuple[float, float]] = []
        for p in pts:
            if not (isinstance(p, tuple) and len(p) == 2):
                continue
            try:
                vce = float(p[0])
                ic = float(p[1])
            except Exception:
                continue
            pts2.append((vce, ic))

        pts2 = sorted(pts2, key=lambda p: p[0])
        probe = _nearest_point(pts2, float(probe_x))
        region = [yy for xx, yy in pts2 if xx >= float(region_x_min)]

        region_stats: dict[str, Any] = {}
        if len(region) >= 2:
            mn = min(region)
            mx = max(region)
            mean = (mn + mx) / 2.0
            rel_span = (mx - mn) / mean if abs(mean) > 1e-12 else 0.0
            region_stats = {
                "y_min": mn,
                "y_max": mx,
                "y_mean": mean,
                "rel_span_ratio": rel_span,
                "rel_span_percent": rel_span * 100.0,
                "abs_span": mx - mn,
            }

        missing_count = int(s.get("missing_count") or 0)
        missing_targets = s.get("missing_targets") if isinstance(s.get("missing_targets"), list) else []
        missing_targets_s = [str(x).strip() for x in missing_targets if str(x).strip()]
        total_missing += missing_count
        if missing_targets_s and len(missing_examples) < 8:
            missing_examples.extend(missing_targets_s[: max(0, 8 - len(missing_examples))])

        payload["series"].append(
            {
                "name": name,
                "points_count": len(pts2),
                "y_at_probe": probe[1] if probe else None,
                "x_at_probe": probe[0] if probe else None,
                "region_x_ge_min": region_stats or None,
                "missing_count": missing_count,
                "missing_targets": missing_targets_s[:8],
            }
        )

    payload["missing_data"] = {
        "has_missing": total_missing > 0,
        "total_missing_points": total_missing,
        "examples": missing_examples[:8],
    }
    return payload


# Backward-compatible wrapper (will be removed once callers are migrated).
def build_vce_ic_observations(
    *,
    experiment_key: str,
    experiment_title: str,
    table_label: str,
    figure_label: str,
    series: list[dict[str, Any]],
    probe_vce_V: float = 1.0,
    vce_region_min_V: float = 1.0,
) -> dict[str, Any]:
    return build_xy_observations(
        experiment_key=experiment_key,
        experiment_title=experiment_title,
        x_name="VCE",
        x_unit="V",
        y_name="IC",
        y_unit="mA",
        driver=None,
        series=series,
        probe_x=probe_vce_V,
        region_x_min=vce_region_min_V,
    )
