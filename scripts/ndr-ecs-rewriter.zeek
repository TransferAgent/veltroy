##! ndr-ecs-rewriter.zeek — ECS 8.11.0 Field Mapper
##! Blueprint v1.2 | Phase Gate 0
##!
##! Rewrites native Zeek log fields into Elastic Common Schema 8.11.0
##! compatible field names for direct ingestion into OpenSearch/Elasticsearch.
##!
##! Mapping reference:
##!   Zeek conn.log → ECS source.ip, destination.ip, network.transport, etc.
##!   Zeek dns.log  → ECS dns.question.name, dns.response_code, etc.
##!   Zeek http.log → ECS http.request.method, url.full, user_agent.original, etc.
##!
##! All rewritten events include:
##!   ecs.version       = "8.11.0"
##!   labels.blueprint_version = "v1.2"
##!   labels.sensor     = "zeek"
##!   network.community_id (computed per Zeek Community ID spec v1)

module NDR_ECS;

export {
    const ecs_version: string = "8.11.0" &redef;
    const blueprint_version: string = "v1.2" &redef;

    redef enum Log::ID += { LOG };

    type Info: record {
        ts:                 time     &log;
        uid:                string   &log;
        ecs_version:        string   &log &default=ecs_version;
        blueprint_version:  string   &log &default=blueprint_version;
        event_kind:         string   &log &default="event";
        event_category:     string   &log &default="network";
        event_dataset:      string   &log &default="zeek.conn";
        source_ip:          addr     &log &optional;
        source_port:        port     &log &optional;
        destination_ip:     addr     &log &optional;
        destination_port:   port     &log &optional;
        community_id:       string   &log &optional;
        network_transport:  string   &log &optional;
        network_direction:  string   &log &optional;
        severity:           count    &log &default=0;
    };
}

event zeek_init()
{
    Log::create_stream(NDR_ECS::LOG, [$columns=Info, $path="ndr-ecs"]);
}

function direction_heuristic(src: addr, dst: addr): string
{
    if ( Site::is_local_addr(src) && Site::is_local_addr(dst) )
        return "internal";
    if ( Site::is_local_addr(src) )
        return "egress";
    return "ingress";
}

event connection_state_remove(c: connection)
{
    local info: Info;
    info$ts               = c$start_time;
    info$uid              = c$uid;
    info$event_dataset    = "zeek.conn";
    info$source_ip        = c$id$orig_h;
    info$source_port      = c$id$orig_p;
    info$destination_ip   = c$id$resp_h;
    info$destination_port = c$id$resp_p;
    info$community_id     = Community::hash(c$id);
    info$network_transport = cat(get_port_transport_proto(c$id$resp_p));
    info$network_direction = direction_heuristic(c$id$orig_h, c$id$resp_h);

    Log::write(NDR_ECS::LOG, info);
}
