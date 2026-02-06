"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_TYPES, ASSET_STATUSES, Asset } from "@/lib/asset-types";

interface StaffMember {
  STAFF_ID: number;
  STAFF_NAME: string;
  IS_ACTIVE: boolean;
}

interface AssetFormProps {
  mode: "create" | "edit";
  initialData?: Asset;
  assetId?: string;
}

export function AssetForm({ mode, initialData, assetId }: AssetFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assigneeMode, setAssigneeMode] = useState<"staff" | "other">(
    initialData?.ASSIGNED_TO_OTHER ? "other" : "staff"
  );

  const [form, setForm] = useState({
    asset_tag: initialData?.ASSET_TAG || "",
    asset_type: initialData?.ASSET_TYPE || "",
    brand: initialData?.BRAND || "",
    model: initialData?.MODEL || "",
    serial_number: initialData?.SERIAL_NUMBER || "",
    status: initialData?.STATUS || "Inventory",
    assigned_to_staff_id: initialData?.ASSIGNED_TO_STAFF_ID?.toString() || "",
    assigned_to_other: initialData?.ASSIGNED_TO_OTHER || "",
    purchase_date: initialData?.PURCHASE_DATE?.split("T")[0] || "",
    purchase_cost: initialData?.PURCHASE_COST?.toString() || "",
    warranty_expiry: initialData?.WARRANTY_EXPIRY?.split("T")[0] || "",
    liquidated_date: initialData?.LIQUIDATED_DATE?.split("T")[0] || "",
    notes: initialData?.NOTES || "",
  });

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setStaff(data.filter((s: StaffMember) => s.IS_ACTIVE));
        }
      })
      .catch(() => {});
  }, []);

  // Status change side effects
  useEffect(() => {
    if (form.status === "Inventory" || form.status === "Liquidated" || form.status === "Lost") {
      setForm((prev) => ({
        ...prev,
        assigned_to_staff_id: "",
        assigned_to_other: "",
      }));
    }
    if (form.status === "Liquidated" && !form.liquidated_date) {
      setForm((prev) => ({
        ...prev,
        liquidated_date: new Date().toISOString().split("T")[0],
      }));
    }
  }, [form.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const showAssignee = form.status === "In Use" || form.status === "Repair";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.asset_type || !form.brand || !form.model) {
      setError("Asset type, brand, and model are required.");
      return;
    }

    if (form.status === "In Use" && !form.assigned_to_staff_id && !form.assigned_to_other) {
      setError("Assignee is required when status is 'In Use'.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        asset_tag: form.asset_tag || null,
        asset_type: form.asset_type,
        brand: form.brand,
        model: form.model,
        serial_number: form.serial_number || null,
        status: form.status,
        assigned_to_staff_id:
          assigneeMode === "staff" && form.assigned_to_staff_id
            ? parseInt(form.assigned_to_staff_id)
            : null,
        assigned_to_other:
          assigneeMode === "other" && form.assigned_to_other
            ? form.assigned_to_other
            : null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
        warranty_expiry: form.warranty_expiry || null,
        liquidated_date: form.liquidated_date || null,
        notes: form.notes || null,
      };

      const url = mode === "create" ? "/api/assets" : `/api/assets/${assetId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save asset");
      }

      const saved = await res.json();
      router.push(`/assets/${saved.ASSET_ID || assetId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "New Asset" : "Edit Asset"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Identity Section */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="asset_type">Asset Type *</Label>
              <Select
                value={form.asset_type}
                onValueChange={(v) => setForm({ ...form, asset_type: v })}
              >
                <SelectTrigger id="asset_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="asset_tag">Asset Tag</Label>
              <Input
                id="asset_tag"
                value={form.asset_tag}
                onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
                placeholder="e.g. VA-LT-001"
              />
            </div>

            <div>
              <Label htmlFor="brand">Brand *</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Apple, Dell, Lenovo"
              />
            </div>

            <div>
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. MacBook Pro 14&quot;"
              />
            </div>

            <div>
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
              />
            </div>
          </div>

          {/* Status & Assignment Section */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showAssignee && (
              <>
                <div>
                  <Label>Assignee Type</Label>
                  <div className="mt-1 flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="assigneeMode"
                        checked={assigneeMode === "staff"}
                        onChange={() => {
                          setAssigneeMode("staff");
                          setForm({ ...form, assigned_to_other: "" });
                        }}
                      />
                      Staff Member
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="assigneeMode"
                        checked={assigneeMode === "other"}
                        onChange={() => {
                          setAssigneeMode("other");
                          setForm({ ...form, assigned_to_staff_id: "" });
                        }}
                      />
                      Other
                    </label>
                  </div>
                </div>

                {assigneeMode === "staff" ? (
                  <div>
                    <Label htmlFor="assigned_to_staff_id">Assigned To (Staff) {form.status === "In Use" ? "*" : ""}</Label>
                    <Select
                      value={form.assigned_to_staff_id}
                      onValueChange={(v) =>
                        setForm({ ...form, assigned_to_staff_id: v })
                      }
                    >
                      <SelectTrigger id="assigned_to_staff_id">
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
                    <Label htmlFor="assigned_to_other">Assigned To (Other) {form.status === "In Use" ? "*" : ""}</Label>
                    <Input
                      id="assigned_to_other"
                      value={form.assigned_to_other}
                      onChange={(e) =>
                        setForm({ ...form, assigned_to_other: e.target.value })
                      }
                      placeholder="e.g. contractor name"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Purchase & Warranty Section */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="purchase_date">Purchase Date</Label>
              <Input
                id="purchase_date"
                type="date"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="purchase_cost">Purchase Cost</Label>
              <Input
                id="purchase_cost"
                type="number"
                step="0.01"
                value={form.purchase_cost}
                onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="warranty_expiry">Warranty Expiry</Label>
              <Input
                id="warranty_expiry"
                type="date"
                value={form.warranty_expiry}
                onChange={(e) =>
                  setForm({ ...form, warranty_expiry: e.target.value })
                }
              />
            </div>
          </div>

          {form.status === "Liquidated" && (
            <div className="max-w-xs">
              <Label htmlFor="liquidated_date">Liquidated Date</Label>
              <Input
                id="liquidated_date"
                type="date"
                value={form.liquidated_date}
                onChange={(e) =>
                  setForm({ ...form, liquidated_date: e.target.value })
                }
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : mode === "create" ? "Create Asset" : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(assetId ? `/assets/${assetId}` : "/assets")}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
