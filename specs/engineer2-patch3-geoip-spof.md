# CRITICAL PATCH 3 — GeoIP SPOF Mitigation
## Engineer 2 | Blueprint v1.2.1 | PATCH-003
## Three-Layer GeoIP Architecture

### Layer 1: Primary — MaxMind GeoLite2 (local DB)
### Layer 2: Secondary — ASN database (always runs)
### Layer 3: Tertiary — ASN reputation scoring
### Layer 4: Fallback — graceful degradation if primary fails

```
filter {

  # LAYER 1: MaxMind GeoLite2 (local, primary)
  geoip {
    source   => "[source][ip]"
    target   => "[source][geo]"
    database => "/etc/logstash/geoip/GeoLite2-City.mmdb"
    tag_on_failure => ["_geoip_primary_failure"]
  }

  # LAYER 2: ASN database (always runs)
  geoip {
    source   => "[source][ip]"
    target   => "[source][as]"
    database => "/etc/logstash/geoip/GeoLite2-ASN.mmdb"
    default_database_type => "ASN"
    tag_on_failure => ["_geoip_asn_failure"]
  }

  # LAYER 3: ASN Reputation Scoring
  translate {
    source      => "[source][as][number]"
    target      => "[threat][indicator][provider]"
    dictionary_path => "/etc/logstash/dicts/asn_reputation.yml"
    fallback    => "unknown"
    add_tag_on_success => ["asn_reputation_hit"]
  }

  # LAYER 4: Fallback tag if primary GeoIP fails
  if "_geoip_primary_failure" in [tags] {
    mutate {
      add_field => {
        "[source][geo][country_name]"     => "GEOIP_UNAVAILABLE"
        "[source][geo][country_iso_code]" => "XX"
      }
      add_tag => ["geoip_degraded_mode"]
    }
    # Pipeline continues — no data loss, no silent failure
  }

}
```

## Key Design Decisions
- No silent failure: if GeoIP is unavailable, country_iso_code = "XX" and tag = "geoip_degraded_mode"
- ASN always runs independently of GeoIP city lookup
- ASN reputation scoring flags high-risk providers (hosting/VPN/TOR)
- Weekly GeoIP database refresh via cron (Sundays 03:00 UTC)
