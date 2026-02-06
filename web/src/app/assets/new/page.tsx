"use client";

import { AppLayout } from "@/components/app-layout";
import { AssetForm } from "@/components/assets/AssetForm";
import Link from "next/link";

export default function NewAssetPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <Link href="/assets" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Assets
        </Link>
        <AssetForm mode="create" />
      </div>
    </AppLayout>
  );
}
