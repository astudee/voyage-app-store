"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AgentStat {
  ID: string;
  AGENT_ID: string;
  AGENT_NAME: string;
  AGENT_EMAIL: string;
  OPEN_TICKETS: number;
  ACTIONABLE_TICKETS: number;
  COMPLETED_LAST_7_DAYS: number;
}

interface SnapshotSummary {
  ID: string;
  SNAPSHOT_DATE: string;
  TOTAL_OPEN_TICKETS: number;
  TOTAL_ACTIONABLE_TICKETS: number;
  TOTAL_COMPLETED_LAST_7_DAYS: number;
  CREATED_BY: string;
}

interface SnapshotData extends SnapshotSummary {
  agent_stats: AgentStat[];
}

type SortField = "AGENT_NAME" | "OPEN_TICKETS" | "ACTIONABLE_TICKETS" | "COMPLETED_LAST_7_DAYS";

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return <span className="ml-1 text-xs text-gray-400">—</span>;
  const color = diff > 0 ? "text-red-600" : "text-green-600";
  const prefix = diff > 0 ? "+" : "";
  return <span className={`ml-1 text-xs ${color}`}>{prefix}{diff}</span>;
}

function DeltaCard({ current, previous, inverted }: { current: number; previous: number | undefined; inverted?: boolean }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return <p className="text-xs text-gray-400">No change</p>;
  // For "Completed", more is good (green), less is bad (red)
  // For "Open"/"Actionable", less is good (green), more is bad (red)
  const isPositive = inverted ? diff > 0 : diff < 0;
  const color = isPositive ? "text-green-600" : "text-red-600";
  const arrow = diff > 0 ? "↑" : "↓";
  const prefix = diff > 0 ? "+" : "";
  return <p className={`text-xs ${color}`}>{prefix}{diff} {arrow} vs comparison</p>;
}

export default function TicketsDashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [compareSnapshot, setCompareSnapshot] = useState<SnapshotData | null>(null);
  const [compareId, setCompareId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState("");

  // Sort state
  const [sortField, setSortField] = useState<SortField>("OPEN_TICKETS");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets/snapshots");
      const data = await res.json();
      if (Array.isArray(data)) {
        setSnapshots(data);
        if (data.length > 0) {
          // Get details of most recent snapshot
          const detailRes = await fetch(`/api/tickets/snapshots/${data[0].ID}`);
          const detail = await detailRes.json();
          if (detail.ID) setSnapshot(detail);
        }
      }
    } catch {
      // no snapshots yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Fetch comparison snapshot when selected
  useEffect(() => {
    if (!compareId) {
      setCompareSnapshot(null);
      return;
    }
    fetch(`/api/tickets/snapshots/${compareId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ID) setCompareSnapshot(data);
      })
      .catch(() => setCompareSnapshot(null));
  }, [compareId]);

  async function takeSnapshot() {
    setSnapping(true);
    setError("");
    try {
      const res = await fetch("/api/tickets/snapshot", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to take snapshot");
      }
      await fetchSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSnapping(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "AGENT_NAME" ? "asc" : "desc");
    }
  }

  function sortedAgents(): AgentStat[] {
    if (!snapshot?.agent_stats) return [];
    return [...snapshot.agent_stats].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }

  function getCompareAgent(agentId: string): AgentStat | undefined {
    return compareSnapshot?.agent_stats?.find((a) => a.AGENT_ID === agentId);
  }

  function sortIndicator(field: SortField): string {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatShortDate(d: string): string {
    return new Date(d).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Snapshots available for comparison (exclude current)
  const comparisonOptions = snapshots.filter((s) => s.ID !== snapshot?.ID);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ticket Watcher</h1>
            {snapshot && (
              <p className="text-sm text-gray-500">
                Last snapshot: {formatDate(snapshot.SNAPSHOT_DATE)} by {snapshot.CREATED_BY}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {comparisonOptions.length > 0 && (
              <Select value={compareId} onValueChange={setCompareId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Compare to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No comparison</SelectItem>
                  {comparisonOptions.map((s) => (
                    <SelectItem key={s.ID} value={s.ID}>
                      {formatShortDate(s.SNAPSHOT_DATE)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Link href="/tickets/history">
              <Button variant="outline" size="sm">History</Button>
            </Link>
            <Button onClick={takeSnapshot} disabled={snapping} size="sm">
              {snapping ? "Taking Snapshot..." : "Take Snapshot"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : !snapshot ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-gray-500">No snapshots yet. Take your first snapshot to see ticket data.</p>
            <Button onClick={takeSnapshot} disabled={snapping} className="mt-4" size="sm">
              {snapping ? "Taking Snapshot..." : "Take Snapshot"}
            </Button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-500">Total Open Tickets</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">
                    {snapshot.TOTAL_OPEN_TICKETS}
                  </p>
                  <DeltaCard
                    current={snapshot.TOTAL_OPEN_TICKETS}
                    previous={compareSnapshot?.TOTAL_OPEN_TICKETS}
                  />
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-blue-700">Actionable Tickets</p>
                  <p className="mt-1 text-3xl font-bold text-blue-900">
                    {snapshot.TOTAL_ACTIONABLE_TICKETS}
                  </p>
                  <DeltaCard
                    current={snapshot.TOTAL_ACTIONABLE_TICKETS}
                    previous={compareSnapshot?.TOTAL_ACTIONABLE_TICKETS}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-500">Completed Last 7 Days</p>
                  <p className="mt-1 text-3xl font-bold text-green-700">
                    {snapshot.TOTAL_COMPLETED_LAST_7_DAYS}
                  </p>
                  <DeltaCard
                    current={snapshot.TOTAL_COMPLETED_LAST_7_DAYS}
                    previous={compareSnapshot?.TOTAL_COMPLETED_LAST_7_DAYS}
                    inverted
                  />
                </CardContent>
              </Card>
            </div>

            {/* Agent Table */}
            <div className="rounded-lg border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("AGENT_NAME")}
                    >
                      Agent{sortIndicator("AGENT_NAME")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => handleSort("OPEN_TICKETS")}
                    >
                      Open{sortIndicator("OPEN_TICKETS")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => handleSort("ACTIONABLE_TICKETS")}
                    >
                      Actionable{sortIndicator("ACTIONABLE_TICKETS")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => handleSort("COMPLETED_LAST_7_DAYS")}
                    >
                      Completed (7d){sortIndicator("COMPLETED_LAST_7_DAYS")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents().map((agent) => {
                    const compare = getCompareAgent(agent.AGENT_ID);
                    return (
                      <TableRow key={agent.ID}>
                        <TableCell className="font-medium">
                          {agent.AGENT_NAME}
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.OPEN_TICKETS}
                          <Delta current={agent.OPEN_TICKETS} previous={compare?.OPEN_TICKETS} />
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.ACTIONABLE_TICKETS}
                          <Delta current={agent.ACTIONABLE_TICKETS} previous={compare?.ACTIONABLE_TICKETS} />
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.COMPLETED_LAST_7_DAYS}
                          <Delta current={agent.COMPLETED_LAST_7_DAYS} previous={compare?.COMPLETED_LAST_7_DAYS} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
