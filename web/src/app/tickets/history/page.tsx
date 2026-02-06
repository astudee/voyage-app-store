"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface SnapshotRow {
  ID: string;
  SNAPSHOT_DATE: string;
  TOTAL_OPEN_TICKETS: number;
  TOTAL_ACTIONABLE_TICKETS: number;
  TOTAL_COMPLETED_LAST_7_DAYS: number;
  CREATED_BY: string;
}

export default function TicketHistoryPage() {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tickets/snapshots")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSnapshots(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // Chart data - chronological order (oldest first)
  const chartData = [...snapshots]
    .reverse()
    .map((s) => ({
      date: formatShortDate(s.SNAPSHOT_DATE),
      "Total Open": s.TOTAL_OPEN_TICKETS,
      Actionable: s.TOTAL_ACTIONABLE_TICKETS,
      "Completed (7d)": s.TOTAL_COMPLETED_LAST_7_DAYS,
    }));

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Snapshot History</h1>
            <p className="text-sm text-gray-500">
              {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/tickets">
            <Button variant="outline" size="sm">Back to Dashboard</Button>
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : snapshots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-gray-500">No snapshots yet.</p>
            <Link href="/tickets">
              <Button className="mt-4" size="sm">Go to Dashboard</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Trend Chart */}
            {chartData.length >= 2 && (
              <div className="rounded-lg border bg-white p-4">
                <h2 className="mb-4 text-sm font-semibold text-gray-700">
                  Ticket Trends Over Time
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Total Open"
                      stroke="#6b7280"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Actionable"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Completed (7d)"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Snapshot List */}
            <div className="rounded-lg border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total Open</TableHead>
                    <TableHead className="text-right">Actionable</TableHead>
                    <TableHead className="text-right">Completed (7d)</TableHead>
                    <TableHead>Taken By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((s) => (
                    <TableRow
                      key={s.ID}
                      className="cursor-pointer"
                      onClick={() => router.push(`/tickets/history/${s.ID}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(s.SNAPSHOT_DATE)}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.TOTAL_OPEN_TICKETS}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.TOTAL_ACTIONABLE_TICKETS}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.TOTAL_COMPLETED_LAST_7_DAYS}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {s.CREATED_BY}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
