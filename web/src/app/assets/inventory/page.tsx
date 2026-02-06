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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Asset } from "@/lib/asset-types";

interface StaffMember {
  STAFF_ID: number;
  STAFF_NAME: string;
  IS_ACTIVE: boolean;
}

export default function InventoryPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign dialog state
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [assignMode, setAssignMode] = useState<"staff" | "other">("staff");
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignOther, setAssignOther] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const [assetsRes, staffRes] = await Promise.all([
        fetch("/api/assets?status=Inventory"),
        fetch("/api/staff"),
      ]);
      const assetsData = await assetsRes.json();
      const staffData = await staffRes.json();
      if (Array.isArray(assetsData)) setAssets(assetsData);
      if (Array.isArray(staffData)) setStaff(staffData.filter((s: StaffMember) => s.IS_ACTIVE));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function openAssign(asset: Asset) {
    setAssignAsset(asset);
    setAssignMode("staff");
    setAssignStaffId("");
    setAssignOther("");
  }

  async function handleAssign() {
    if (!assignAsset) return;
    const staffId = assignMode === "staff" && assignStaffId ? parseInt(assignStaffId) : null;
    const other = assignMode === "other" && assignOther ? assignOther : null;

    if (!staffId && !other) return;

    setAssigning(true);
    try {
      const res = await fetch(`/api/assets/${assignAsset.ASSET_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_tag: assignAsset.ASSET_TAG,
          asset_type: assignAsset.ASSET_TYPE,
          brand: assignAsset.BRAND,
          model: assignAsset.MODEL,
          serial_number: assignAsset.SERIAL_NUMBER,
          status: "In Use",
          assigned_to_staff_id: staffId,
          assigned_to_other: other,
          purchase_date: assignAsset.PURCHASE_DATE?.split("T")[0] || null,
          purchase_cost: assignAsset.PURCHASE_COST,
          warranty_expiry: assignAsset.WARRANTY_EXPIRY?.split("T")[0] || null,
          notes: assignAsset.NOTES,
        }),
      });

      if (res.ok) {
        setAssignAsset(null);
        fetchData();
      }
    } catch {
      // ignore
    } finally {
      setAssigning(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm text-gray-500">
              {assets.length} item{assets.length !== 1 ? "s" : ""} available for assignment
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
        ) : assets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-gray-500">No items in inventory.</p>
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.ASSET_ID}>
                    <TableCell
                      className="cursor-pointer font-mono text-xs"
                      onClick={() => router.push(`/assets/${a.ASSET_ID}`)}
                    >
                      {a.ASSET_TAG || "—"}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => router.push(`/assets/${a.ASSET_ID}`)}
                    >
                      {a.ASSET_TYPE}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => router.push(`/assets/${a.ASSET_ID}`)}
                    >
                      {a.BRAND} {a.MODEL}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer font-mono text-xs"
                      onClick={() => router.push(`/assets/${a.ASSET_ID}`)}
                    >
                      {a.SERIAL_NUMBER || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openAssign(a)}>
                        Assign
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={!!assignAsset} onOpenChange={(open) => !open && setAssignAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign {assignAsset?.BRAND} {assignAsset?.MODEL}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Assignee Type</Label>
              <div className="mt-1 flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={assignMode === "staff"}
                    onChange={() => setAssignMode("staff")}
                  />
                  Staff Member
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={assignMode === "other"}
                    onChange={() => setAssignMode("other")}
                  />
                  Other
                </label>
              </div>
            </div>

            {assignMode === "staff" ? (
              <div>
                <Label>Staff Member</Label>
                <Select value={assignStaffId} onValueChange={setAssignStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.STAFF_ID} value={s.STAFF_ID.toString()}>
                        {s.STAFF_NAME}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Name</Label>
                <Input
                  value={assignOther}
                  onChange={(e) => setAssignOther(e.target.value)}
                  placeholder="e.g. contractor name"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAsset(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assigning || (assignMode === "staff" ? !assignStaffId : !assignOther)}
            >
              {assigning ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
