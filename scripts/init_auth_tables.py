#!/usr/bin/env python3
"""
Part A — Initialize auth tables in data/ndr.db (LAB SQLite).
Run once on startup if tables do not exist.
Sprint 4 S4-04 | Blueprint v1.2
"""

import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ndr.db")


def init_tables(db_path: str = DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-tenants" (
            tenant_id         TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            tier              TEXT NOT NULL DEFAULT 'trial',
            status            TEXT NOT NULL DEFAULT 'active',
            is_trial          INTEGER NOT NULL DEFAULT 1,
            trial_expires_at  TEXT,
            parent_tenant_id  TEXT REFERENCES "ndr-tenants"(tenant_id),
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-users" (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id     TEXT NOT NULL REFERENCES "ndr-tenants"(tenant_id),
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'customer',
            is_parent     INTEGER NOT NULL DEFAULT 0,
            mfa_secret    TEXT,
            mfa_verified  INTEGER NOT NULL DEFAULT 0,
            status        TEXT NOT NULL DEFAULT 'active',
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-otp" (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL,
            code_hash   TEXT NOT NULL,   -- bcrypt(code, 10). Plaintext code never persisted.
            expires_at  TEXT NOT NULL,
            attempts    INTEGER NOT NULL DEFAULT 0,
            used        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_otp_email ON "ndr-otp"(email)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON "ndr-users"(email)')

    conn.commit()
    conn.close()
    print(f"[init_auth_tables] Auth tables initialized in {db_path}")


if __name__ == "__main__":
    init_tables()
