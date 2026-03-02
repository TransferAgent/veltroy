# ndr_pre_commit_dispatcher.py
# The ONLY authorised function that dispatches alerts to Engineer 4 (Kinetic Layer)
# Engineer 3 — Data Architect | Blueprint v1.2.1

import hashlib
import json
from datetime import datetime, timezone
from opensearchpy import OpenSearch

client = OpenSearch(hosts=[{"host": "opensearch", "port": 9200}])


def build_correlation_id(source_ip: str, timestamp: str, sigma_rule_id: str) -> str:
    """Deterministic, idempotent correlation ID — the audit anchor."""
    raw = f"{source_ip}|{timestamp}|{sigma_rule_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def pre_commit_and_dispatch(alert_payload: dict, eng4_dispatch_fn) -> dict:
    """
    THE PRE-COMMIT PATTERN
    ─────────────────────
    Step 1: Generate eng3_correlation_id
    Step 2: Write full alert to ndr-correlated-* (Data Lake FIRST)
    Step 3: Confirm OpenSearch write (result='created')
    Step 4: ONLY THEN dispatch to Engineer 4
    Step 5: Update doc with dispatch confirmation

    If Step 2 or 3 fails → alert is SUPPRESSED. Never dispatched.
    The Hands do not move without the Brain's written record.
    """
    ts  = alert_payload.get("@timestamp", datetime.now(timezone.utc).isoformat())
    ip  = alert_payload["source"]["ip"]
    sid = alert_payload["event"]["sigma_rule_id"]

    # Step 1 — Generate correlation ID
    correlation_id = build_correlation_id(ip, ts, sid)
    alert_payload["eng3_correlation_id"] = correlation_id
    alert_payload["correlation"]["pre_commit_written"] = False  # Not yet

    # Step 2 — Write to Data Lake FIRST
    index_name = f"ndr-correlated-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
    response   = client.index(
        index    = index_name,
        id       = correlation_id,   # Idempotent — same event = same doc
        body     = alert_payload,
        refresh  = "wait_for"        # Ensures read-after-write consistency
    )

    # Step 3 — Confirm write
    if response.get("result") not in ("created", "updated"):
        raise RuntimeError(
            f"PRE_COMMIT_FAILED: OpenSearch rejected write for {correlation_id}. "
            f"Alert SUPPRESSED. Eng4 NOT notified."
        )

    # Step 4 — Mark as committed, dispatch to Eng4
    alert_payload["correlation"]["pre_commit_written"]  = True
    alert_payload["correlation"]["pre_commit_index"]    = index_name
    alert_payload["correlation"]["pre_commit_doc_id"]   = response["_id"]

    dispatch_result = eng4_dispatch_fn(alert_payload)

    # Step 5 — Update doc with dispatch confirmation
    client.update(
        index = index_name,
        id    = correlation_id,
        body  = {
            "doc": {
                "labels": {
                    "eng4_dispatched":     True,
                    "eng4_dispatch_time":  datetime.now(timezone.utc).isoformat(),
                    "eng4_response_code":  dispatch_result.get("status_code")
                }
            }
        }
    )

    return dispatch_result
