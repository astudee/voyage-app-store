"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Asset, statusColor } from "@/lib/asset-types";

interface AssetGroup {
  name: string;
  sortKey: number; // 0=staff, 1=other, 2=unassigned
  assets: Asset[];
}

export default function ByPersonPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAssets(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Group assets by assignee
  const groups: AssetGroup[] = [];
  const staffMap = new Map<string, Asset[]>();
  const otherMap = new Map<string, Asset[]>();
  const unassigned: Asset[] = [];

  for (const a of assets) {
    if (a.ASSIGNED_TO_STAFF_NAME) {
      const key = a.ASSIGNED_TO_STAFF_NAME;
      if (!staffMap.has(key)) staffMap.set(key, []);
      staffMap.get(key)!.push(a);
    } else if (a.ASSIGNED_TO_OTHER) {
      const key = a.ASSIGNED_TO_OTHER;
      if (!otherMap.has(key)) otherMap.set(key, []);
      otherMap.get(key)!.push(a);
    } else {
      unassigned.push(a);
    }
  }

  // Staff members first (sorted alphabetically)
  for (const [name, items] of [...staffMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ name, sortKey: 0, assets: items });
  }
  // Other/contractors
  for (const [name, items] of [...otherMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ name: `${name} (Other)`, sortKey: 1, assets: items });
  }
  // Unassigned
  if (unassigned.length > 0) {
    groups.push({ name: "Unassigned", sortKey: 2, assets: unassigned });
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assets by Person</h1>
            <p className="text-sm text-gray-500">
              {groups.length} group{groups.length !== 1 ? "s" : ""}, {assets.length} asset{assets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/assets">
              <Button variant="outline" size="sm">All Assets</Button>
            </Link>
            <Link href="/assets/new">
              <Button size="sm">+ Add Asset</Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500">No assets found.</p>
        ) : (
          groups.map((group) => (
            <div key={group.name} className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3">
                <h2 className="font-semibold text-gray-900">
                  {group.name}{" "}
                  <span className="font-normal text-gray-500">
                    ({group.assets.length})
                  </span>
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Tag</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand / Model</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.assets.map((a) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
