#!/usr/bin/env python3
"""
sqlite_to_postgres.py — NDR Platform Data Migration
Blueprint v1.2 | Sprint 4

Migrates data from SQLite (data/ndr.db) to RDS PostgreSQL.
Supports dry-run mode via DRY_RUN=true environment variable.
"""

import json
import os
import sqlite3
import sys
from typing import Any, Dict, List, Tuple

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_DB = os.getenv("PG_DB", "ndr")
PG_USER = os.getenv("PG_USER", "ndr_admin")
PG_PASSWORD = os.getenv("PG_PASSWORD", "")
PG_PORT = int(os.getenv("PG_PORT", "5432"))

BATCH_SIZE = 500

SOURCE_TABLES = [
    "ndr-network",
    "ndr-identity",
    "ndr-correlated",
    "ndr-dlq",
    "ndr-tickets",
    "ndr-kinetic",
]


def get_sqlite_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_pg_conn():
    if psycopg2 is None:
        raise ImportError("psycopg2 not installed. Run: pip install psycopg2-binary")
    return psycopg2.connect(
        host=PG_HOST,
        database=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
        port=PG_PORT,
    )


def get_table_columns(sqlite_conn: sqlite3.Connection, table: str) -> List[str]:
    cursor = sqlite_conn.execute(f'PRAGMA table_info("{table}")')
    return [row[1] for row in cursor.fetchall()]


def get_row_count(sqlite_conn: sqlite3.Connection, table: str) -> int:
    try:
        return sqlite_conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    except sqlite3.OperationalError:
        return 0


def ensure_tenant_id(row: Dict[str, Any]) -> Dict[str, Any]:
    if "tenant_id" not in row or row["tenant_id"] is None:
        row["tenant_id"] = "default"
    return row


def migrate_table(sqlite_conn: sqlite3.Connection, pg_conn, table: str):
    pg_table = table.replace("-", "_")

    columns = get_table_columns(sqlite_conn, table)
    source_count = get_row_count(sqlite_conn, table)

    print(f"\n  [{table}] Source rows: {source_count}")
    print(f"  [{table}] Columns: {', '.join(columns)}")

    if source_count == 0:
        print(f"  [{table}] Skipped — no rows")
        return source_count, 0

    if DRY_RUN:
        print(f"  [{table}] DRY RUN — would migrate {source_count} rows to ndr.{pg_table}")
        return source_count, 0

    cursor = sqlite_conn.execute(f'SELECT * FROM "{table}"')
    rows = cursor.fetchall()

    pg_cursor = pg_conn.cursor()
    migrated = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        for row in batch:
            row_dict = dict(row)
            row_dict = ensure_tenant_id(row_dict)

            col_names = list(row_dict.keys())
            placeholders = ", ".join(["%s"] * len(col_names))
            col_str = ", ".join(col_names)

            try:
                pg_cursor.execute(
                    f'INSERT INTO ndr.{pg_table} ({col_str}) VALUES ({placeholders})',
                    list(row_dict.values())
                )
                migrated += 1
            except Exception as e:
                print(f"  [{table}] Row error: {e}")

        pg_conn.commit()
        print(f"  [{table}] Batch {i // BATCH_SIZE + 1}: {len(batch)} rows inserted")

    pg_cursor.close()
    print(f"  [{table}] Migrated: {migrated}/{source_count}")
    return source_count, migrated


def verify_counts(sqlite_conn: sqlite3.Connection, pg_conn):
    print("\n" + "=" * 50)
    print("  VERIFICATION — Source vs Target Counts")
    print("=" * 50)

    pg_cursor = pg_conn.cursor()
    all_match = True

    for table in SOURCE_TABLES:
        pg_table = table.replace("-", "_")
        source = get_row_count(sqlite_conn, table)

        try:
            pg_cursor.execute(f"SELECT COUNT(*) FROM ndr.{pg_table}")
            target = pg_cursor.fetchone()[0]
        except Exception:
            target = -1

        match = source == target
        if not match:
            all_match = False
        status = "MATCH" if match else "MISMATCH"
        print(f"  {table}: source={source}, target={target} [{status}]")

    pg_cursor.close()

    if all_match:
        print("\n  ALL COUNTS MATCH — Migration verified")
    else:
        print("\n  MISMATCHES DETECTED — Manual review required")

    return all_match


def main():
    print("=" * 50)
    print("  NDR Platform — SQLite to PostgreSQL Migration")
    print(f"  Blueprint v1.2 | Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"  Source: {DB_PATH}")
    print(f"  Target: {PG_HOST}:{PG_PORT}/{PG_DB}")
    print("=" * 50)

    sqlite_conn = get_sqlite_conn()

    print("\n  Source table counts:")
    for table in SOURCE_TABLES:
        count = get_row_count(sqlite_conn, table)
        print(f"    {table}: {count}")

    if DRY_RUN:
        print("\n  DRY RUN MODE — No writes to PostgreSQL")
        for table in SOURCE_TABLES:
            migrate_table(sqlite_conn, None, table)
        sqlite_conn.close()
        print("\n  DRY RUN COMPLETE")
        return

    pg_conn = get_pg_conn()

    results = {}
    for table in SOURCE_TABLES:
        source, migrated = migrate_table(sqlite_conn, pg_conn, table)
        results[table] = {"source": source, "migrated": migrated}

    verify_counts(sqlite_conn, pg_conn)

    pg_conn.close()
    sqlite_conn.close()

    print("\n  MIGRATION COMPLETE")
    for table, r in results.items():
        print(f"    {table}: {r['migrated']}/{r['source']}")


if __name__ == "__main__":
    main()
