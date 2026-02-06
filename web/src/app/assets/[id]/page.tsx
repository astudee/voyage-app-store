"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Asset,
  statusColor,
  formatAssetCurrency,
  formatAssetDate,
} from "@/lib/asset-types";

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/assets/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAsset)
      .catch(() => setAsset(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/assets");
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-gray-500">Loading...</p>
      </AppLayout>
    );
  }

  if (!asset) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <p className="text-red-600">Asset not found.</p>
          <Link href="/assets" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Assets
          </Link>
        </div>
      </AppLayout>
    );
  }

  const assignee = asset.ASSIGNED_TO_STAFF_NAME || asset.ASSIGNED_TO_OTHER || "—";

  return (
    <AppLayout>
      <div className="space-y-4">
        <Link href="/assets" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Assets
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>
                  {asset.BRAND} {asset.MODEL}
                </CardTitle>
                <Badge className={statusColor(asset.STATUS)} variant="outline">
                  {asset.STATUS}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Link href={`/assets/${id}/edit`}>
                  <Button variant="outline" size="sm">Edit</Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setShowDelete(true)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              <Field label="Asset Tag" value={asset.ASSET_TAG || "—"} />
              <Field label="Asset Type" value={asset.ASSET_TYPE} />
              <Field label="Brand" value={asset.BRAND} />
              <Field label="Model" value={asset.MODEL} />
              <Field label="Serial Number" value={asset.SERIAL_NUMBER || "—"} />
              <Field label="Assigned To" value={assignee} />
              <Field label="Purchase Date" value={formatAssetDate(asset.PURCHASE_DATE)} />
              <Field label="Purchase Cost" value={formatAssetCurrency(asset.PURCHASE_COST)} />
              <Field label="Warranty Expiry" value={formatAssetDate(asset.WARRANTY_EXPIRY)} />
              {asset.LIQUIDATED_DATE && (
                <Field label="Liquidated Date" value={formatAssetDate(asset.LIQUIDATED_DATE)} />
              )}
            </div>
            {asset.NOTES && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-500">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
                  {asset.NOTES}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Asset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{asset.BRAND} {asset.MODEL}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{value}</p>
    </div>
  );
}
