"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { OffsetForm } from "@/components/offsets-form";
import { toast } from "sonner";

interface Offset {
  OFFSET_ID: number;
  EFFECTIVE_DATE: string;
  SALESPERSON: string;
  CATEGORY: string;
  AMOUNT: number;
  NOTE: string | null;
}

export default function EditOffsetPage() {
  const params = useParams();
  const id = params.id as string;

  const [offset, setOffset] = useState<Offset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOffset = async () => {
      try {
        const response = await fetch(`/api/offsets/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Offset not found");
          } else {
            throw new Error("Failed to fetch offset");
          }
          return;
        }
        const data = await response.json();
        setOffset(data);
      } catch (error) {
        console.error("Error fetching offset:", error);
        toast.error("Failed to load offset");
        setError("Failed to load offset");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchOffset();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !offset) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Offset not found"}
        </div>
      </AppLayout>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  const initialData = {
    effective_date: formatDate(offset.EFFECTIVE_DATE),
    salesperson: offset.SALESPERSON,
    category: offset.CATEGORY,
    amount: offset.AMOUNT.toString(),
    note: offset.NOTE || "",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Offset</h1>
          <p className="text-gray-500">
            Update offset for {offset.SALESPERSON}
          </p>
        </div>

        <OffsetForm
          mode="edit"
          offsetId={offset.OFFSET_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
