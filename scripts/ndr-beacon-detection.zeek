##############################################################
# NDR Beacon Detection — Engineer 1
# Tracks periodic C2-style connections (jitter-aware)
# Output feeds: Triage Agent | Threat Intel Layer
# Platform Law #1 Compliant: Behavioral, NOT signature-based
##############################################################

module NDR_Beacon;

export {
    redef enum Log::ID += { LOG };

    type BeaconRecord: record {
        # ECS: @timestamp
        ts:              time    &log;
        # ECS: source.ip
        src_ip:          addr    &log;
        # ECS: destination.ip
        dst_ip:          addr    &log;
        # ECS: destination.port
        dst_port:        port    &log;
        # Behavioral metrics
        connection_count: count  &log;
        avg_interval_sec: double &log;
        jitter_score:    double  &log;
        # ECS: event.*
        event_kind:      string  &log &default="alert";
        event_category:  string  &log &default="intrusion_detection";
        event_dataset:   string  &log &default="zeek.ndr_beacon";
        # Severity for Triage Agent
        risk_score:      double  &log &optional;
    };

    global log_beacon: event(rec: BeaconRecord);
}

# Track per-pair connection intervals
global conn_tracker: table[addr, addr, port] of vector of time
    &create_expire=1hr;

# Minimum connections before beacon scoring
const BEACON_MIN_CONNECTIONS = 10 &redef;
# Jitter threshold (< 0.15 = suspicious regularity)
const BEACON_JITTER_THRESHOLD = 0.15 &redef;

event connection_established(c: connection)
{
    local key = [c$id$orig_h, c$id$resp_h, c$id$resp_p];

    if(key !in conn_tracker)
        conn_tracker[key] = vector();

    conn_tracker[key] += c$start_time;

    local times = conn_tracker[key];
    if(|times| < BEACON_MIN_CONNECTIONS) return;

    # Calculate inter-arrival intervals
    local intervals: vector of double = vector();
    local i = 1;
    while(i < |times|) {
        intervals += interval_to_double(times[i] - times[i-1]);
        ++i;
    }

    # Compute mean interval
    local total = 0.0;
    for(v in intervals) total += v;
    local mean = total / |intervals|;

    # Compute jitter (coefficient of variation)
    local variance = 0.0;
    for(v in intervals) variance += (v - mean)^2;
    local stddev = sqrt(variance / |intervals|);
    local jitter = stddev / mean;

    if(jitter < BEACON_JITTER_THRESHOLD) {
        local rec = BeaconRecord(
            $ts               = network_time(),
            $src_ip           = c$id$orig_h,
            $dst_ip           = c$id$resp_h,
            $dst_port         = c$id$resp_p,
            $connection_count = |times|,
            $avg_interval_sec = mean,
            $jitter_score     = jitter,
            $risk_score       = (1.0 - jitter) * 100.0
        );
        Log::write(NDR_Beacon::LOG, rec);
    }
}
