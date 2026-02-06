"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { AssetForm } from "@/components/assets/AssetForm";
import { Asset } from "@/lib/asset-types";

export default function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AppLayout>
      <div className="space-y-4">
        <Link href={`/assets/${id}`} className="text-sm text-blue-600 hover:underline">
          &larr; Back to Asset
        </Link>
        <AssetForm mode="edit" initialData={asset} assetId={id} />
      </div>
    </AppLayout>
  );
}
