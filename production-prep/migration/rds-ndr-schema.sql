CREATE SCHEMA IF NOT EXISTS ndr;

CREATE TABLE ndr.tenants (
    tenant_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'basic',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ndr.tickets (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES ndr.tenants(tenant_id),
    alert_type TEXT NOT NULL,
    eng3_correlation_id TEXT,
    severity TEXT NOT NULL,
    source_ip TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    ticket_source TEXT NOT NULL DEFAULT 'SOAR_AUTO',
    blueprint_version TEXT NOT NULL DEFAULT 'v1.2',
    kl_response_seconds FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ndr.audit_log (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    module TEXT NOT NULL,
    playbook TEXT,
    execution_state TEXT,
    blueprint_version TEXT NOT NULL DEFAULT 'v1.2',
    hmac_signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_tenant ON ndr.tickets(tenant_id);
CREATE INDEX idx_audit_tenant ON ndr.audit_log(tenant_id);
CREATE INDEX idx_tickets_status ON ndr.tickets(status);

-- S4-04: Auth tables (PostgreSQL equivalents)

ALTER TABLE ndr.tenants ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE ndr.tenants ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ndr.tenants ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;
ALTER TABLE ndr.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id TEXT REFERENCES ndr.tenants(tenant_id);

CREATE TABLE IF NOT EXISTS ndr.users (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES ndr.tenants(tenant_id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    is_parent BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret TEXT,
    mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ndr.otp (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON ndr.otp(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON ndr.users(email);
