##! local.zeek — NDR Platform Zeek Site Policy
##! Blueprint v1.2 | Phase Gate 0
##!
##! Master loader for all NDR-specific Zeek scripts.
##! Deploy to $PREFIX/share/zeek/site/local.zeek

@load base/frameworks/logging
@load base/protocols/conn
@load base/protocols/dns
@load base/protocols/http
@load base/protocols/ssl

@load ./ndr-ecs-rewriter.zeek
@load ./ndr-beacon-detection.zeek
@load ./ndr-high-cardinality.zeek
@load ./ndr-heartbeat.zeek

redef LogAscii::use_json = T;

redef Site::local_nets += {
    10.0.0.0/8,
    172.16.0.0/12,
    192.168.0.0/16,
};
