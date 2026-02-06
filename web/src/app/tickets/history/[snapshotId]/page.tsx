"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ticketStatusColor,
  priorityColor,
  ZENDESK_TICKET_URL,
} from "@/lib/ticket-types";

interface AgentStat {
  ID: string;
  AGENT_NAME: string;
  AGENT_EMAIL: string;
  OPEN_TICKETS: number;
  ACTIONABLE_TICKETS: number;
  COMPLETED_LAST_7_DAYS: number;
}

interface SnapshotData {
  ID: string;
  SNAPSHOT_DATE: string;
  TOTAL_OPEN_TICKETS: number;
  TOTAL_ACTIONABLE_TICKETS: number;
  TOTAL_COMPLETED_LAST_7_DAYS: number;
  CREATED_BY: string;
  agent_stats: AgentStat[];
}

interface TicketRow {
  ZENDESK_TICKET_ID: number;
  TICKET_SUBJECT: string;
  TICKET_STATUS: string;
  TICKET_PRIORITY: string | null;
  TICKET_TYPE: string;
  REQUESTER_NAME: string;
  CREATED_DATE: string;
}

type SortField = "AGENT_NAME" | "OPEN_TICKETS" | "ACTIONABLE_TICKETS" | "COMPLETED_LAST_7_DAYS";

export default function HistoricalSnapshotPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>;
}) {
  const { snapshotId } = use(params);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  // Drill-down
  const [drillAgent, setDrillAgent] = useState<AgentStat | null>(null);
  const [drillType, setDrillType] = useState<string>("");
  const [drillTickets, setDrillTickets] = useState<TicketRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("OPEN_TICKETS");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch(`/api/tickets/snapshots/${snapshotId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setSnapshot)
      .catch(() => setSnapshot(null))
      .finally(() => setLoading(false));
  }, [snapshotId]);

  async function openDrillDown(agent: AgentStat, type: string) {
    setDrillAgent(agent);
    setDrillType(type);
    setDrillLoading(true);
    setDrillTickets([]);

    try {
      const params = new URLSearchParams();
      params.set("agent_stat_id", agent.ID);
      if (type === "actionable") params.set("ticket_type", "actionable");
      else if (type === "on_hold") params.set("ticket_type", "on_hold");
      else if (type === "completed") params.set("ticket_type", "completed");

      const res = await fetch(
        `/api/tickets/snapshots/${snapshotId}/tickets?${params}`
      );
      const data = await res.json();
      if (Array.isArray(data)) setDrillTickets(data);
    } catch {
      // ignore
    } finally {
      setDrillLoading(false);
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

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-gray-500">Loading...</p>
      </AppLayout>
    );
  }

  if (!snapshot) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <p className="text-red-600">Snapshot not found.</p>
          <Link href="/tickets/history" className="text-sm text-blue-600 hover:underline">
            &larr; Back to History
          </Link>
        </div>
      </AppLayout>
    );
  }

  const drillTitle = drillAgent
    ? `${drillAgent.AGENT_NAME} — ${drillType === "open" ? "Open" : drillType === "actionable" ? "Actionable" : drillType === "completed" ? "Completed (7d)" : "On Hold"} Tickets`
    : "";

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/tickets/history" className="text-sm text-blue-600 hover:underline">
              &larr; Back to History
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              Snapshot: {formatDate(snapshot.SNAPSHOT_DATE)}
            </h1>
            <p className="text-sm text-gray-500">Taken by {snapshot.CREATED_BY}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500">Total Open Tickets</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {snapshot.TOTAL_OPEN_TICKETS}
              </p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-blue-700">Actionable Tickets</p>
              <p className="mt-1 text-3xl font-bold text-blue-900">
                {snapshot.TOTAL_ACTIONABLE_TICKETS}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500">Completed Last 7 Days</p>
              <p className="mt-1 text-3xl font-bold text-green-700">
                {snapshot.TOTAL_COMPLETED_LAST_7_DAYS}
              </p>
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
              {sortedAgents().map((agent) => (
                <TableRow key={agent.ID}>
                  <TableCell
                    className="cursor-pointer font-medium text-blue-700 hover:underline"
                    onClick={() => openDrillDown(agent, "open")}
                  >
                    {agent.AGENT_NAME}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer text-right hover:bg-gray-50"
                    onClick={() => openDrillDown(agent, "open")}
                  >
                    {agent.OPEN_TICKETS}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer text-right hover:bg-gray-50"
                    onClick={() => openDrillDown(agent, "actionable")}
                  >
                    {agent.ACTIONABLE_TICKETS}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer text-right hover:bg-gray-50"
                    onClick={() => openDrillDown(agent, "completed")}
                  >
                    {agent.COMPLETED_LAST_7_DAYS}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Drill-down Dialog */}
      <Dialog open={!!drillAgent} onOpenChange={(open) => !open && setDrillAgent(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{drillTitle}</DialogTitle>
          </DialogHeader>

          {drillLoading ? (
            <p className="text-sm text-gray-500">Loading tickets...</p>
          ) : drillTickets.length === 0 ? (
            <p className="text-sm text-gray-500">No tickets found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillTickets.map((t) => (
                  <TableRow key={t.ZENDESK_TICKET_ID}>
                    <TableCell>
                      <a
                        href={`${ZENDESK_TICKET_URL}/${t.ZENDESK_TICKET_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        #{t.ZENDESK_TICKET_ID}
                      </a>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {t.TICKET_SUBJECT}
                    </TableCell>
                    <TableCell>
                      <Badge className={ticketStatusColor(t.TICKET_STATUS)} variant="outline">
                        {t.TICKET_STATUS}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.TICKET_PRIORITY ? (
                        <Badge className={priorityColor(t.TICKET_PRIORITY)} variant="outline">
                          {t.TICKET_PRIORITY}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{t.REQUESTER_NAME}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {new Date(t.CREATED_DATE).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
