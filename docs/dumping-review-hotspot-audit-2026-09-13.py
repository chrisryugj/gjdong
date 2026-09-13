"""Read-only hotspot benchmark audit; emits aggregate JSON to stdout.

Usage: python3 dumping-review-hotspot-audit-2026-09-13.py PRIVATE_REPO_ROOT
Reads existing derived inputs without importing model scripts or modifying them.
No event rows, cell identifiers, coordinates, or addresses are emitted.
"""
import argparse
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("private_repo_root", type=Path)
    args = parser.parse_args()
    derived = args.private_repo_root / "data" / "derived"

    def read(name):
        with (derived / name).open(encoding="utf-8") as handle:
            return json.load(handle)

    enforcement = read("enforcement.json")
    complaints = read("complaints_geo.json")["rows"]
    geocodes = read("geo_extra_resolved.json")["enf"]
    events = []
    for row in complaints:
        stamp, cell = row.get("ts") or "", row.get("cid")
        if cell and len(stamp) >= 10:
            events.append((stamp[:10], cell, 1))
    for index, row in enumerate(enforcement):
        stamp = row.get("violated_at") or ""
        cell = geocodes.get(str(index), {}).get("cid")
        if cell and len(stamp) >= 10:
            events.append((stamp[:10], cell, 2))
    events.sort()
    data_end = max(event[0] for event in events)
    cutoffs = ["2024-07-01", "2024-10-01", "2025-01-01", "2025-04-01",
               "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]
    names = ["current_decay_weighted", "cumulative_equal", "recent90_equal", "decay_equal"]
    windows = []
    for cutoff in cutoffs:
        origin = dt.date.fromisoformat(cutoff)
        end = (origin + dt.timedelta(days=90)).isoformat()
        if end > data_end:
            break
        history = [event for event in events if event[0] <= cutoff]
        future = [event for event in events if cutoff < event[0] <= end]
        if not future:
            continue
        active = {cell for _, cell, _ in history}
        future_cells = {cell for _, cell, _ in future}
        scores = {name: defaultdict(float) for name in names}
        for day, cell, weight in history:
            age = (origin - dt.date.fromisoformat(day)).days
            decay = 0.5 ** (age / 90)
            scores["current_decay_weighted"][cell] += weight * decay
            scores["cumulative_equal"][cell] += 1
            if age <= 90:
                scores["recent90_equal"][cell] += 1
            scores["decay_equal"][cell] += decay
        models = {}
        for name, score in scores.items():
            # Match the existing script's stable sort and chronological insertion order.
            top = set(sorted(score, key=lambda cell: -score[cell])[:20])
            captured = sum(cell in top for _, cell, _ in future)
            models[name] = {
                "selected_cells": len(top),
                "captured_events": captured,
                "capture_pct": captured / len(future) * 100,
                "precision20_pct": len(top & future_cells) / 20 * 100,
            }
        reported_random = 20 / max(len(active), 20) * 100
        historically_active_share = sum(cell in active for _, cell, _ in future) / len(future)
        windows.append({
            "cutoff": cutoff, "end_inclusive": end,
            "future_events": len(future), "future_cells": len(future_cells),
            "historical_active_cells": len(active),
            "future_share_in_historical_active_cells": historically_active_share,
            "models": models,
            "random_reported_capture_pct": reported_random,
            "random_historical_support_expected_capture_pct": reported_random * historically_active_share,
        })
    count = len(windows)
    averages = {
        name: {metric: sum(row["models"][name][metric] for row in windows) / count
               for metric in ("capture_pct", "precision20_pct")}
        for name in names
    }
    result = {
        "audit_date": "2026-09-13", "read_only": True,
        "source_files": ["data/derived/enforcement.json", "data/derived/complaints_geo.json",
                         "data/derived/geo_extra_resolved.json"],
        "reference_implementation": "scripts/build_decision_layer.py:150-238",
        "method": {
            "budget_cells": 20, "future_days": 90, "half_life_days": 90,
            "current_weights": {"complaint": 1, "enforcement": 2},
            "evaluation": "Unweighted future administrative-record capture; arithmetic mean across windows.",
            "recent90_boundary": "Includes history from cutoff minus 90 days through cutoff, inclusive.",
            "ties": "Stable descending score sort, preserving first insertion in sorted event stream.",
            "deduplication": "None; matches existing model. Administrative records need not be unique incidents.",
            "random_support": "Uniform sample of 20 historically active cells; future events outside support cannot be captured.",
        },
        "limitations": [
            "Retrospective alternative-model comparison, not a preregistered independent test.",
            "Eight windows do not establish statistically significant differences between models.",
            "Alternative models have deterministic ties; tie-breaking sensitivity is not evaluated.",
            "No source data, coordinates, addresses, or cell identifiers are emitted.",
        ],
        "window_count": count, "event_records": len(events), "windows": windows,
        "mean_metrics": averages,
        "mean_random_reported_capture_pct": sum(row["random_reported_capture_pct"] for row in windows) / count,
        "mean_random_historical_support_expected_capture_pct": sum(
            row["random_historical_support_expected_capture_pct"] for row in windows) / count,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
