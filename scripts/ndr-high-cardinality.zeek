##############################################################
# NDR High-Cardinality Connection Tracker — Engineer 1
# Blueprint v1.2 | Sprint 2 | Priority 1 [CRITICAL]
# Modification 1 Response: SCAFFOLDED → FULL IMPLEMENTATION
#
# Logic: Track unique destination IPs per source host
# Window 1: 5 minutes  → threshold > 15 unique dst IPs = ALERT
# Window 2: 60 minutes → threshold > 15 unique dst IPs = ALERT
# Rationale: Detects port scans, lateral movement, C2 fan-out
# ECS Output: zeek.ndr_high_cardinality | event.kind = alert
##############################################################

module NDR_HighCardinality;

export {
    redef enum Log::ID += { LOG };

    type HighCardRecord: record {
        # ECS: @timestamp
        ts:               time    &log;
        # ECS: source.ip
        src_ip:           addr    &log;
        # ECS: network.*
        unique_dst_count: count   &log;
        unique_dst_ports: count   &log;
        # Detection window context
        window_seconds:   count   &log;
        sample_dst_ips:   set[addr] &log;
        # ECS: event.*
        event_kind:       string  &log &default="alert";
        event_category:   string  &log &default="intrusion_detection";
        event_type:       string  &log &default="indicator";
        event_dataset:    string  &log &default="zeek.ndr_high_cardinality";
        # Triage Agent fields
        risk_score:       double  &log;
        detection_class:  string  &log;   # lateral_movement | port_scan | c2_fanout
        # Blueprint labels
        blueprint_version: string &log &default="v1.2";
        tier:             string  &log &default="tier1_behavioral";
    };

    global log_high_cardinality: event(rec: HighCardRecord);

    # Architect-mandated thresholds
    const UNIQUE_DST_THRESHOLD    = 15    &redef;   # > 15 unique dst IPs
    const WINDOW_5MIN_SECS        = 300   &redef;
    const WINDOW_60MIN_SECS       = 3600  &redef;
    const MAX_SAMPLE_IPS          = 10    &redef;   # Cap sample set for log verbosity
}

# ─── STATE TABLES ────────────────────────────────────────────
# 5-minute rolling window: src_ip → set of dst_ips seen
global tracker_5min: table[addr] of set[addr]
    &create_expire=5mins
    &expire_func=check_5min_expiry;

# 60-minute rolling window
global tracker_60min: table[addr] of set[addr]
    &create_expire=60mins
    &expire_func=check_60min_expiry;

# Port tracking per source (for port scan classification)
global port_tracker_5min: table[addr] of set[port]
    &create_expire=5mins;

# Dedup: prevent re-alerting same src within cooldown
global alert_cooldown: table[addr, count] of time
    &create_expire=5mins;

# ─── LOG STREAM INIT ─────────────────────────────────────────
event zeek_init()
{
    Log::create_stream(NDR_HighCardinality::LOG,
        [$columns=HighCardRecord,
         $path="ndr_high_cardinality"]);
}

# ─── ALERT EMISSION FUNCTION ─────────────────────────────────
function emit_alert(src: addr, dst_set: set[addr],
                    port_set: set[port], window: count)
{
    local cooldown_key = [src, window];
    if(cooldown_key in alert_cooldown) return;
    alert_cooldown[cooldown_key] = network_time();

    # Classify detection type
    local dclass = "high_cardinality";
    if(|port_set| > 50)
        dclass = "port_scan";
    else if(|dst_set| > 30 && |port_set| <= 5)
        dclass = "c2_fanout";
    else if(|dst_set| > 15 && Site::is_local_addr(src))
        dclass = "lateral_movement";

    # Risk score: scales with cardinality, penalizes internal src
    local base_score = (|dst_set| / 100.0) * 100.0;
    if(base_score > 100.0) base_score = 100.0;
    if(Site::is_local_addr(src)) base_score = base_score * 1.2;
    if(base_score > 100.0) base_score = 100.0;

    # Build sample IP set (capped)
    local sample: set[addr] = set();
    local count_added = 0;
    for(d in dst_set) {
        if(count_added >= MAX_SAMPLE_IPS) break;
        add sample[d];
        ++count_added;
    }

    local rec = HighCardRecord(
        $ts               = network_time(),
        $src_ip           = src,
        $unique_dst_count = |dst_set|,
        $unique_dst_ports = |port_set|,
        $window_seconds   = window,
        $sample_dst_ips   = sample,
        $risk_score       = base_score,
        $detection_class  = dclass
    );
    Log::write(NDR_HighCardinality::LOG, rec);
}

# ─── CORE EVENT HOOK ─────────────────────────────────────────
event connection_established(c: connection)
{
    local src  = c$id$orig_h;
    local dst  = c$id$resp_h;
    local dport = c$id$resp_p;

    # ── 5-MINUTE WINDOW TRACKING ──────────────────────────────
    if(src !in tracker_5min)
        tracker_5min[src] = set();
    add tracker_5min[src][dst];

    if(src !in port_tracker_5min)
        port_tracker_5min[src] = set();
    add port_tracker_5min[src][dport];

    if(|tracker_5min[src]| > UNIQUE_DST_THRESHOLD) {
        local ports_5 = src in port_tracker_5min
            ? port_tracker_5min[src] : set();
        emit_alert(src, tracker_5min[src], ports_5,
                   WINDOW_5MIN_SECS);
    }

    # ── 60-MINUTE WINDOW TRACKING ─────────────────────────────
    if(src !in tracker_60min)
        tracker_60min[src] = set();
    add tracker_60min[src][dst];

    if(|tracker_60min[src]| > UNIQUE_DST_THRESHOLD) {
        local ports_60 = src in port_tracker_5min
            ? port_tracker_5min[src] : set();
        emit_alert(src, tracker_60min[src], ports_60,
                   WINDOW_60MIN_SECS);
    }
}

# ─── EXPIRY CALLBACKS (clean emit on window close) ───────────
function check_5min_expiry(t: table[addr] of set[addr], idx: addr): interval
{
    if(idx in t && |t[idx]| > UNIQUE_DST_THRESHOLD) {
        local ports = idx in port_tracker_5min
            ? port_tracker_5min[idx] : set();
        emit_alert(idx, t[idx], ports, WINDOW_5MIN_SECS);
    }
    return 0secs;
}

function check_60min_expiry(t: table[addr] of set[addr], idx: addr): interval
{
    if(idx in t && |t[idx]| > UNIQUE_DST_THRESHOLD) {
        emit_alert(idx, t[idx], set(), WINDOW_60MIN_SECS);
    }
    return 0secs;
}
