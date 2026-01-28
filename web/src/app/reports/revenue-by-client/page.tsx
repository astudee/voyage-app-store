"use client";

import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Download, RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";

// US State codes
const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
];

interface ClientDetail {
  date: string;
  amount: number;
  memo: string;
}

interface ClientRevenue {
  client: string;
  state: string | null;
  revenue: number;
  transactions: number;
  details: ClientDetail[];
}

interface StateRevenue {
  state: string;
  revenue: number;
  clients: number;
  percentage: number;
}

interface ReportData {
  year: number;
  totalRevenue: number;
  totalTransactions: number;
  clientCount: number;
  clients: ClientRevenue[];
  revenueByState: StateRevenue[];
  timestamp: string;
}

type SortDirection = "asc" | "desc";
type StateSortColumn = "state" | "revenue" | "clients" | "percentage";
type ClientSortColumn = "client" | "state" | "revenue" | "transactions" | "percentage";

// Sortable header component
function SortableHeader({
  label,
  column,
  currentColumn,
  currentDirection,
  onSort,
  className = "",
}: {
  label: string;
  column: string;
  currentColumn: string;
  currentDirection: SortDirection;
  onSort: (column: string) => void;
  className?: string;
}) {
  const isActive = column === currentColumn;
  return (
    <TableHead
      className={`cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${className.includes("text-right") ? "justify-end" : ""}`}>
        {label}
        {isActive ? (
          currentDirection === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <span className="w-3" />
        )}
      </div>
    </TableHead>
  );
}

export default function RevenueByClientPage() {
  const [year, setYear] = useState(2025);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [savingStates, setSavingStates] = useState<Set<string>>(new Set());

  // Sorting state for State table
  const [stateSortColumn, setStateSortColumn] = useState<StateSortColumn>("revenue");
  const [stateSortDirection, setStateSortDirection] = useState<SortDirection>("desc");

  // Sorting state for Client table
  const [clientSortColumn, setClientSortColumn] = useState<ClientSortColumn>("revenue");
  const [clientSortDirection, setClientSortDirection] = useState<SortDirection>("desc");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/revenue-by-client?year=${year}`);
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sort state data
  const sortedStateData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.revenueByState].sort((a, b) => {
      // Always keep "Unassigned" at the bottom
      if (a.state === "Unassigned") return 1;
      if (b.state === "Unassigned") return -1;

      let comparison = 0;
      switch (stateSortColumn) {
        case "state":
          comparison = a.state.localeCompare(b.state);
          break;
        case "revenue":
          comparison = a.revenue - b.revenue;
          break;
        case "clients":
          comparison = a.clients - b.clients;
          break;
        case "percentage":
          comparison = a.percentage - b.percentage;
          break;
      }
      return stateSortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [data, stateSortColumn, stateSortDirection]);

  // Sort client data
  const sortedClientData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.clients].sort((a, b) => {
      let comparison = 0;
      switch (clientSortColumn) {
        case "client":
          comparison = a.client.localeCompare(b.client);
          break;
        case "state":
          const stateA = a.state || "zzz"; // Put nulls at end when ascending
          const stateB = b.state || "zzz";
          comparison = stateA.localeCompare(stateB);
          break;
        case "revenue":
          comparison = a.revenue - b.revenue;
          break;
        case "transactions":
          comparison = a.transactions - b.transactions;
          break;
        case "percentage":
          comparison = (a.revenue / data.totalRevenue) - (b.revenue / data.totalRevenue);
          break;
      }
      return clientSortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [data, clientSortColumn, clientSortDirection]);

  const handleStateSort = (column: string) => {
    const col = column as StateSortColumn;
    if (stateSortColumn === col) {
      setStateSortDirection(stateSortDirection === "asc" ? "desc" : "asc");
    } else {
      setStateSortColumn(col);
      setStateSortDirection(col === "state" ? "asc" : "desc");
    }
  };

  const handleClientSort = (column: string) => {
    const col = column as ClientSortColumn;
    if (clientSortColumn === col) {
      setClientSortDirection(clientSortDirection === "asc" ? "desc" : "asc");
    } else {
      setClientSortColumn(col);
      setClientSortDirection(col === "client" || col === "state" ? "asc" : "desc");
    }
  };

  const toggleExpanded = (client: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(client)) {
      newExpanded.delete(client);
    } else {
      newExpanded.add(client);
    }
    setExpandedClients(newExpanded);
  };

  const handleStateChange = async (clientName: string, stateCode: string) => {
    setSavingStates((prev) => new Set(prev).add(clientName));

    try {
      const response = await fetch("/api/client-states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          year,
          stateCode: stateCode === "none" ? "" : stateCode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save state");
      }

      // Update local state
      if (data) {
        const newClients = data.clients.map((c) =>
          c.client === clientName
            ? { ...c, state: stateCode === "none" ? null : stateCode }
            : c
        );

        // Recalculate state revenue
        const stateRevenue: Map<string, { revenue: number; clients: number }> = new Map();
        for (const client of newClients) {
          const state = client.state || "Unassigned";
          const existing = stateRevenue.get(state) || { revenue: 0, clients: 0 };
          existing.revenue += client.revenue;
          existing.clients += 1;
          stateRevenue.set(state, existing);
        }

        const revenueByState = Array.from(stateRevenue.entries())
          .map(([state, d]) => ({
            state,
            revenue: Math.round(d.revenue * 100) / 100,
            clients: d.clients,
            percentage: Math.round((d.revenue / data.totalRevenue) * 1000) / 10,
          }));

        setData({ ...data, clients: newClients, revenueByState });
      }
    } catch (err) {
      console.error("Failed to save state:", err);
    } finally {
      setSavingStates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(clientName);
        return newSet;
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const downloadCSV = () => {
    if (!data) return;

    const headers = ["Client", "State", "Revenue", "Transactions", "% of Total"];
    const rows = sortedClientData.map((c) => [
      c.client,
      c.state || "",
      c.revenue.toFixed(2),
      c.transactions.toString(),
      ((c.revenue / data.totalRevenue) * 100).toFixed(1) + "%",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
      "",
      `"Total","","${data.totalRevenue.toFixed(2)}","${data.totalTransactions}","100%"`,
      "",
      "",
      "Revenue by State",
      "State,Revenue,Clients,%",
      ...sortedStateData.map((s) =>
        [`"${s.state}"`, s.revenue.toFixed(2), s.clients, `${s.percentage}%`].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-by-client-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unassignedCount = data?.clients.filter((c) => !c.state).length || 0;

  return (
    <AppLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#333333]">Revenue Apportionment</h1>
          <p className="text-sm text-gray-500">
            QuickBooks Consulting Income by Client with State Apportionment
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Year:</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || 2025)}
              className="w-24"
              min={2000}
              max={2100}
            />
          </div>
          <Button onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button variant="outline" onClick={downloadCSV} disabled={!data}>
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[#336699]">
                  {formatCurrency(data.totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.clientCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totalTransactions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Avg per Client
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalRevenue / data.clientCount)}
                </p>
              </CardContent>
            </Card>
            <Card className={unassignedCount > 0 ? "border-orange-300 bg-orange-50" : "border-green-300 bg-green-50"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Unassigned States
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${unassignedCount > 0 ? "text-orange-600" : "text-green-600"}`}>
                  {unassignedCount}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue by State Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue by State - {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader
                      label="State"
                      column="state"
                      currentColumn={stateSortColumn}
                      currentDirection={stateSortDirection}
                      onSort={handleStateSort}
                    />
                    <SortableHeader
                      label="Revenue"
                      column="revenue"
                      currentColumn={stateSortColumn}
                      currentDirection={stateSortDirection}
                      onSort={handleStateSort}
                      className="text-right"
                    />
                    <SortableHeader
                      label="Clients"
                      column="clients"
                      currentColumn={stateSortColumn}
                      currentDirection={stateSortDirection}
                      onSort={handleStateSort}
                      className="text-right"
                    />
                    <SortableHeader
                      label="% of Total"
                      column="percentage"
                      currentColumn={stateSortColumn}
                      currentDirection={stateSortDirection}
                      onSort={handleStateSort}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStateData.map((state) => (
                    <TableRow
                      key={state.state}
                      className={state.state === "Unassigned" ? "bg-orange-50" : ""}
                    >
                      <TableCell className="font-medium">
                        {state.state === "Unassigned" ? (
                          <span className="text-orange-600">{state.state}</span>
                        ) : (
                          <>
                            {state.state}{" "}
                            <span className="text-gray-400 text-sm">
                              ({US_STATES.find((s) => s.code === state.state)?.name || state.state})
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(state.revenue)}
                      </TableCell>
                      <TableCell className="text-right">{state.clients}</TableCell>
                      <TableCell className="text-right">{state.percentage}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-gray-100">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">{data.clientCount}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Client Table */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Client - {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <SortableHeader
                      label="Client"
                      column="client"
                      currentColumn={clientSortColumn}
                      currentDirection={clientSortDirection}
                      onSort={handleClientSort}
                    />
                    <SortableHeader
                      label="State"
                      column="state"
                      currentColumn={clientSortColumn}
                      currentDirection={clientSortDirection}
                      onSort={handleClientSort}
                      className="w-40"
                    />
                    <SortableHeader
                      label="Revenue"
                      column="revenue"
                      currentColumn={clientSortColumn}
                      currentDirection={clientSortDirection}
                      onSort={handleClientSort}
                      className="text-right"
                    />
                    <SortableHeader
                      label="Transactions"
                      column="transactions"
                      currentColumn={clientSortColumn}
                      currentDirection={clientSortDirection}
                      onSort={handleClientSort}
                      className="text-right"
                    />
                    <SortableHeader
                      label="% of Total"
                      column="percentage"
                      currentColumn={clientSortColumn}
                      currentDirection={clientSortDirection}
                      onSort={handleClientSort}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedClientData.map((client) => (
                    <>
                      <TableRow
                        key={client.client}
                        className={`hover:bg-gray-50 ${!client.state ? "bg-orange-50/50" : ""}`}
                      >
                        <TableCell
                          className="w-8 cursor-pointer"
                          onClick={() => toggleExpanded(client.client)}
                        >
                          {expandedClients.has(client.client) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell
                          className="font-medium cursor-pointer"
                          onClick={() => toggleExpanded(client.client)}
                        >
                          {client.client}
                        </TableCell>
                        <TableCell className="w-40">
                          <Select
                            value={client.state || "none"}
                            onValueChange={(value) => handleStateChange(client.client, value)}
                            disabled={savingStates.has(client.client)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                <span className="text-gray-400">-- Select --</span>
                              </SelectItem>
                              {US_STATES.map((state) => (
                                <SelectItem key={state.code} value={state.code}>
                                  {state.code} - {state.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(client.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{client.transactions}</TableCell>
                        <TableCell className="text-right">
                          {((client.revenue / data.totalRevenue) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                      {expandedClients.has(client.client) && (
                        <TableRow key={`${client.client}-details`}>
                          <TableCell colSpan={6} className="bg-gray-50 p-0">
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Memo</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {client.details.map((detail, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="text-sm">
                                        {formatDate(detail.date)}
                                      </TableCell>
                                      <TableCell className="text-sm text-gray-600">
                                        {detail.memo || "-"}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm">
                                        {formatCurrency(detail.amount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {/* Total Row */}
                  <TableRow className="font-bold bg-gray-100">
                    <TableCell></TableCell>
                    <TableCell>TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">{data.totalTransactions}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-gray-400 text-right">
            Data fetched: {new Date(data.timestamp).toLocaleString()}
          </p>
        </>
      )}
    </div>
    </AppLayout>
  );
}
