##############################################################
# NDR Telemetry Heartbeat — Engineer 1
# Blueprint v1.2 | Sprint 2 | Priority 2 [CRITICAL]
# SPOF Response: Eliminates silent sensor failure blind spot
#
# Mechanism:
#   - Zeek emits synthetic heartbeat event every 60 seconds
#   - n8n monitors heartbeat log; no receipt in 90s = SENSOR DARK
#   - Auto-restart directive is embedded in alert payload
#   - Downstream: Conductor / Triage Agent receive 'sensor_dark' event
##############################################################

module NDR_Heartbeat;

export {
    redef enum Log::ID += { LOG };

    type HeartbeatRecord: record {
        # ECS: @timestamp
        ts:               time    &log;
        # Heartbeat identity
        sensor_id:        string  &log;
        sensor_host:      string  &log;
        sequence_number:  count   &log;
        # ECS: event.*
        event_kind:       string  &log;
        event_dataset:    string  &log &default="zeek.ndr_heartbeat";
        event_category:   string  &log &default="process";
        # Health metrics
        status:           string  &log;   # ALIVE | DEGRADED | DARK
        uptime_seconds:   double  &log;
        packets_processed: count  &log &optional;
        # Auto-restart directive (consumed by n8n watchdog)
        auto_restart_eligible: bool &log &default=T;
        restart_command:  string  &log
            &default="/opt/zeek/bin/zeekctl restart";
        # Blueprint labels
        blueprint_version: string &log &default="v1.2";
        tier:             string  &log &default="infrastructure";
    };

    # Configurable intervals — Architect mandated: 60s emit / 90s timeout
    const HEARTBEAT_INTERVAL  = 60secs  &redef;
    const SENSOR_DARK_TIMEOUT = 90secs  &redef;

    global log_heartbeat: event(rec: HeartbeatRecord);
}

# ─── STATE ───────────────────────────────────────────────────
global hb_sequence:   count  = 0;
global hb_start_time: time;
global hb_packet_count: count = 0;

# ─── LOG STREAM INIT ─────────────────────────────────────────
event zeek_init()
{
    Log::create_stream(NDR_Heartbeat::LOG,
        [$columns=HeartbeatRecord,
         $path="ndr_heartbeat"]);

    hb_start_time = network_time();

    # Schedule first heartbeat
    schedule HEARTBEAT_INTERVAL { NDR_Heartbeat::emit_heartbeat() };
}

# ─── HEARTBEAT EMISSION ──────────────────────────────────────
event NDR_Heartbeat::emit_heartbeat()
{
    ++hb_sequence;

    local uptime = interval_to_double(
        network_time() - hb_start_time);

    local rec = HeartbeatRecord(
        $ts               = network_time(),
        $sensor_id        = fmt("zeek-sensor-%s",
                                gethostname()),
        $sensor_host      = gethostname(),
        $sequence_number  = hb_sequence,
        $event_kind       = "event",
        $status           = "ALIVE",
        $uptime_seconds   = uptime,
        $packets_processed = hb_packet_count
    );

    Log::write(NDR_Heartbeat::LOG, rec);

    # Reschedule — perpetual loop
    schedule HEARTBEAT_INTERVAL { NDR_Heartbeat::emit_heartbeat() };
}

# ─── PACKET COUNTER (health metric) ─────────────────────────
event new_packet(c: connection, p: pkt_hdr)
{
    ++hb_packet_count;
}

# ─── GRACEFUL SHUTDOWN HEARTBEAT ─────────────────────────────
event zeek_done()
{
    local rec = HeartbeatRecord(
        $ts               = network_time(),
        $sensor_id        = fmt("zeek-sensor-%s",
                                gethostname()),
        $sensor_host      = gethostname(),
        $sequence_number  = hb_sequence + 1,
        $event_kind       = "alert",
        $status           = "DARK",
        $uptime_seconds   = interval_to_double(
                                network_time() - hb_start_time),
        $auto_restart_eligible = T
    );
    Log::write(NDR_Heartbeat::LOG, rec);
}
