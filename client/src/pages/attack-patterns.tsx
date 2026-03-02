import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  BrainCircuit,
  Target,
  Link2,
  Tag,
  Code,
  Search as SearchIcon,
} from "lucide-react";
import type { AttackPattern } from "@shared/schema";

const severityColors: Record<string, string> = {
  low: "hsl(142, 76%, 36%)",
  medium: "hsl(32, 95%, 44%)",
  high: "hsl(340, 82%, 48%)",
  critical: "hsl(0, 84%, 42%)",
};

function PatternCard({ pattern }: { pattern: AttackPattern }) {
  return (
    <Card className="hover-elevate" data-testid={`card-pattern-${pattern.pattern_id}`}>
      <CardHeader className="pb-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BrainCircuit
              className="h-4 w-4 shrink-0"
              style={{ color: severityColors[pattern.severity] }}
            />
            <CardTitle className="text-sm font-medium leading-tight truncate">
              {pattern.pattern_name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge
              style={{
                backgroundColor: severityColors[pattern.severity],
                color: "white",
              }}
              className="text-[10px]"
              data-testid={`badge-severity-${pattern.pattern_id}`}
            >
              {pattern.severity}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              {(pattern.confidence_score * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {pattern.description}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Tactic</p>
              <p className="text-[10px] font-medium">{pattern.mitre_tactic}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Technique</p>
              <p className="text-[10px] font-mono">{pattern.mitre_technique_id}</p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <Tag className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex flex-wrap gap-1">
            {pattern.ioc_tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[9px] px-1.5 py-0 h-4"
                data-testid={`badge-ioc-${pattern.pattern_id}-${tag}`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="border-t pt-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Code className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-muted-foreground">Detection Rule</p>
          </div>
          <pre className="text-[10px] font-mono bg-accent/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all" data-testid={`text-rule-${pattern.pattern_id}`}>
            {pattern.raw_pattern_text}
          </pre>
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {pattern.pattern_id}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {pattern.related_community_ids.length} linked flows
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AttackPatterns() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [tacticFilter, setTacticFilter] = useState<string>("all");

  const { data: patterns, isLoading } = useQuery<AttackPattern[]>({
    queryKey: ["/api/attack-patterns"],
    refetchInterval: 10000,
  });

  const allPatterns = patterns || [];

  const tactics = Array.from(new Set(allPatterns.map((p) => p.mitre_tactic))).sort();

  const filtered = allPatterns.filter((p) => {
    if (severityFilter !== "all" && p.severity !== severityFilter) return false;
    if (tacticFilter !== "all" && p.mitre_tactic !== tacticFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.pattern_name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.mitre_technique_id.toLowerCase().includes(q) ||
        p.mitre_tactic.toLowerCase().includes(q) ||
        p.ioc_tags.some((t) => t.toLowerCase().includes(q)) ||
        p.raw_pattern_text.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Attack Patterns
          </h1>
          <p className="text-xs text-muted-foreground">
            Eng 3 — kNN Vector Index (ndr-attack-patterns)
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
          Blueprint v1.2
        </Badge>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search patterns, techniques, IoCs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
            data-testid="input-search-patterns"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[120px] text-xs h-9" data-testid="select-severity-filter">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tacticFilter} onValueChange={setTacticFilter}>
          <SelectTrigger className="w-[160px] text-xs h-9" data-testid="select-tactic-filter">
            <SelectValue placeholder="Tactic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tactics</SelectItem>
            {tactics.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-pattern-count">
          {filtered.length} patterns
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BrainCircuit className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No patterns match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((pattern) => (
            <PatternCard key={pattern.pattern_id} pattern={pattern} />
          ))}
        </div>
      )}
    </div>
  );
}
