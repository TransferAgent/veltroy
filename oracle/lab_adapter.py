# LAB ADAPTER — Conductor authorized. DEPLOYMENT_STAGE=LAB only. Remove for production.
#
# Intercepts OpenSearch queries from ndr_phase_gate_0_oracle_v2.py and redirects
# them to data/ndr.db (SQLite). Zero changes to Oracle logic required.
#
# Usage: In the Oracle runner, monkey-patch requests before importing the Oracle:
#   import oracle.lab_adapter as lab
#   lab.install()
#   # Then run oracle logic
#
# Or run the Oracle via: python3 oracle/lab_runner.py <TEST_RUN_ID>

import json
import os
import re
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

FLASK_BUS_URL = "http://localhost:8000"
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")

INDEX_TO_TABLE = {
    "ndr-correlated": "ndr-correlated",
    "ndr-network": "ndr-network",
    "ndr-identity": "ndr-identity",
    "ndr-dlq": "ndr-dlq",
    "ndr-dlq-bad-schema": "ndr-dlq",
}


def _resolve_table(index_pattern: str) -> str:
    clean = re.sub(r"[-_]\*$", "", index_pattern)
    clean = re.sub(r"-\d{4}\.\d{2}\.\d{2}$", "", clean)
    for prefix, table in INDEX_TO_TABLE.items():
        if clean.startswith(prefix) or clean == prefix:
            return table
    return clean


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_term_conditions(query: Dict) -> List[Tuple[str, Any]]:
    conditions = []

    if "term" in query:
        for field, value in query["term"].items():
            conditions.append((field, value))
    elif "bool" in query:
        must = query["bool"].get("must", [])
        for clause in must:
            if "term" in clause:
                for field, value in clause["term"].items():
                    conditions.append((field, value))
            elif "range" in clause:
                pass
    return conditions


def _event_matches_conditions(event: Dict, conditions: List[Tuple[str, Any]]) -> bool:
    for field, expected in conditions:
        parts = field.split(".")
        val = event
        for part in parts:
            if isinstance(val, dict):
                val = val.get(part)
            else:
                val = None
                break

        if val is None:
            return False

        if isinstance(expected, bool):
            if val is not expected and val != expected:
                return False
        elif str(val) != str(expected):
            return False

    return True


def _compute_agg(events: List[Dict], agg_name: str, agg_def: Dict) -> Any:
    for agg_type, agg_config in agg_def.items():
        if agg_type in ("avg", "max", "min", "sum"):
            field_path = agg_config["field"]
            values = []
            for ev in events:
                parts = field_path.split(".")
                val = ev
                for p in parts:
                    if isinstance(val, dict):
                        val = val.get(p)
                    else:
                        val = None
                        break
                if val is not None and isinstance(val, (int, float)):
                    values.append(val)

            if not values:
                return {"value": None}
            if agg_type == "avg":
                return {"value": sum(values) / len(values)}
            elif agg_type == "max":
                return {"value": max(values)}
            elif agg_type == "min":
                return {"value": min(values)}
            elif agg_type == "sum":
                return {"value": sum(values)}
    return {"value": None}


def search(index_pattern: str, body: Dict) -> Dict:
    table = _resolve_table(index_pattern)
    conn = _get_conn()

    try:
        rows = conn.execute(f'SELECT event_json FROM "{table}"').fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        conn.close()

    all_events = []
    for row in rows:
        try:
            ev = json.loads(row["event_json"])
            all_events.append(ev)
        except (json.JSONDecodeError, KeyError):
            pass

    query = body.get("query", {})
    conditions = _parse_term_conditions(query)

    matched = [ev for ev in all_events if _event_matches_conditions(ev, conditions)]

    size = body.get("size", 10)
    source_filter = body.get("_source")

    hits_list = []
    for ev in matched[:size] if size > 0 else []:
        source_data = ev
        if source_filter and isinstance(source_filter, list):
            filtered = {}
            for sf in source_filter:
                parts = sf.split(".")
                val = ev
                for p in parts:
                    if isinstance(val, dict):
                        val = val.get(p)
                    else:
                        val = None
                        break
                if val is not None:
                    ref = filtered
                    for p in parts[:-1]:
                        if p not in ref:
                            ref[p] = {}
                        ref = ref[p]
                    ref[parts[-1]] = val
            source_data = filtered

        hits_list.append({
            "_index": table,
            "_id": ev.get("id", ev.get("eng3_correlation_id", "")),
            "_score": 1.0,
            "_source": source_data,
        })

    result = {
        "hits": {
            "total": {"value": len(matched), "relation": "eq"},
            "hits": hits_list,
        }
    }

    aggs = body.get("aggs", {})
    if aggs:
        result["aggregations"] = {}
        for agg_name, agg_def in aggs.items():
            result["aggregations"][agg_name] = _compute_agg(matched, agg_name, agg_def)

    return result


class _MockResponse:
    def __init__(self, data: Dict):
        self._data = data
        self.status_code = 200
        self.text = json.dumps(data)

    def json(self):
        return self._data


_real_requests_get = None
_real_requests_post = None


def _patched_get(url: str, **kwargs):
    if "/_search" in url:
        path = url.split("/")
        idx = 0
        for i, seg in enumerate(path):
            if seg == "_search":
                idx = i - 1
                break
        index_pattern = path[idx] if idx >= 0 else "ndr-correlated-*"

        body = kwargs.get("json", {})
        result = search(index_pattern, body)
        return _MockResponse(result)

    return _real_requests_get(url, **kwargs)


def _patched_post(url: str, **kwargs):
    if FLASK_BUS_URL in url:
        import requests as real_req
        return real_req.post(url, **kwargs)
    return _real_requests_post(url, **kwargs)


def install():
    import requests
    global _real_requests_get, _real_requests_post

    _real_requests_get = requests.get
    _real_requests_post = requests.post

    requests.get = _patched_get
    requests.post = _patched_post

    print(f"[lab_adapter] Installed — OpenSearch queries redirected to SQLite ({DB_PATH})")
    print(f"[lab_adapter] Flask Bus URL: {FLASK_BUS_URL}")
    print(f"[lab_adapter] DEPLOYMENT_STAGE=LAB")


def dry_test():
    print(f"[lab_adapter] DRY TEST — Verifying table access...")
    conn = _get_conn()
    tables = ["ndr-network", "ndr-identity", "ndr-correlated", "ndr-dlq"]
    all_ok = True

    for table in tables:
        try:
            count = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            print(f"  ✓ {table}: {count} records")
        except sqlite3.OperationalError as e:
            print(f"  ✗ {table}: ERROR — {e}")
            all_ok = False

    conn.close()

    print(f"\n[lab_adapter] Testing search() function...")
    test_queries = [
        ("ndr-correlated-*", {"query": {"term": {"alert_type": "C2_BEACON"}}, "size": 1}),
        ("ndr-correlated-*", {"query": {"bool": {"must": [{"term": {"correlation.pre_commit_written": True}}]}}, "size": 1}),
        ("ndr-dlq-bad-schema-*", {"query": {"term": {"labels.test_run_id": "DRY_TEST"}}, "size": 0}),
        ("ndr-network-*", {"query": {"term": {"labels.test_run_id": "DRY_TEST"}}, "size": 1}),
        ("ndr-correlated-*", {
            "query": {"term": {"alert_type": "C2_BEACON"}},
            "aggs": {"avg_lat": {"avg": {"field": "labels.detection_latency_seconds"}}},
            "size": 0,
        }),
        ("ndr-correlated-*", {
            "query": {"term": {"alert_type": "C2_BEACON"}},
            "_source": ["network_summary.community_ids"],
            "size": 10,
        }),
    ]

    for idx, (index, body) in enumerate(test_queries):
        try:
            result = search(index, body)
            total = result["hits"]["total"]["value"]
            has_aggs = "aggregations" in result
            print(f"  ✓ Query {idx+1} ({index}): {total} hits" +
                  (f" | aggs: {list(result['aggregations'].keys())}" if has_aggs else ""))
        except Exception as e:
            print(f"  ✗ Query {idx+1} ({index}): ERROR — {e}")
            all_ok = False

    status = "ALL TABLES AND QUERIES ACCESSIBLE" if all_ok else "ERRORS DETECTED"
    print(f"\n[lab_adapter] DRY TEST RESULT: {status}")
    return all_ok


if __name__ == "__main__":
    dry_test()
