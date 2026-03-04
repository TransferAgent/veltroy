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
