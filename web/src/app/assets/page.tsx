"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
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
import { Badge } from "@/components/ui/badge";
import { Asset, ASSET_TYPES, ASSET_STATUSES, statusColor } from "@/lib/asset-types";

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  async function fetchAssets() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setAssets(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAssets();
  }, [statusFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => fetchAssets(), 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function assigneeName(a: Asset): string {
    return a.ASSIGNED_TO_STAFF_NAME || a.ASSIGNED_TO_OTHER || "—";
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Asset Tracker</h1>
            <p className="text-sm text-gray-500">
              {assets.length} asset{assets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/assets/by-person">
              <Button variant="outline" size="sm">By Person</Button>
            </Link>
            <Link href="/assets/inventory">
              <Button variant="outline" size="sm">Inventory</Button>
            </Link>
            <Link href="/assets/new">
              <Button size="sm">+ Add Asset</Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {ASSET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ASSET_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Search brand, model, serial, assignee..."
            className="w-[300px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : assets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-gray-500">No assets found.</p>
            <Link href="/assets/new">
              <Button className="mt-4" size="sm">+ Add Your First Asset</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Brand / Model</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow
                    key={a.ASSET_ID}
                    className="cursor-pointer"
                    onClick={() => router.push(`/assets/${a.ASSET_ID}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {a.ASSET_TAG || "—"}
                    </TableCell>
                    <TableCell>{a.ASSET_TYPE}</TableCell>
                    <TableCell>
                      {a.BRAND} {a.MODEL}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.SERIAL_NUMBER || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor(a.STATUS)} variant="outline">
                        {a.STATUS}
                      </Badge>
                    </TableCell>
                    <TableCell>{assigneeName(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
