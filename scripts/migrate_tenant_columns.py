#!/usr/bin/env python3
"""
Add tenant_id column to pipeline event tables if not present.
Safe to run multiple times (idempotent).
Tables: ndr-network, ndr-identity, ndr-correlated
Existing rows get tenant_id = 'global' (City View data).
"""

import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ndr.db")

TABLES = ["ndr-network", "ndr-identity", "ndr-correlated"]


def has_column(cursor, table, column):
    cursor.execute(f'PRAGMA table_info("{table}")')
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def migrate(db_path=DB_PATH):
    if not os.path.exists(db_path):
        print(f"[migrate_tenant_columns] DB not found at {db_path} — skipping (will be created later)")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for table in TABLES:
        try:
            if not has_column(cursor, table, "tenant_id"):
                cursor.execute(f'ALTER TABLE "{table}" ADD COLUMN tenant_id TEXT DEFAULT \'global\'')
                print(f"[migrate_tenant_columns] Added tenant_id to {table}")
            else:
                print(f"[migrate_tenant_columns] {table} already has tenant_id — skipping")
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                print(f"[migrate_tenant_columns] Table {table} does not exist yet — skipping")
            else:
                raise

    for table, idx_name in [("ndr-network", "idx_network_tenant"), ("ndr-identity", "idx_identity_tenant"), ("ndr-correlated", "idx_correlated_tenant")]:
        try:
            cursor.execute(f'CREATE INDEX IF NOT EXISTS {idx_name} ON "{table}"(tenant_id)')
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                print(f"[migrate_tenant_columns] Table {table} missing — skipping index")
            else:
                raise

    conn.commit()
    conn.close()
    print("[migrate_tenant_columns] Migration complete")


if __name__ == "__main__":
    migrate()
