"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { FixedFeeForm } from "@/components/fixed-fee-form";
import { toast } from "sonner";

interface FixedFeeRevenue {
  REVENUE_ID: number;
  PROJECT_ID: number;
  MONTH_DATE: string;
  REVENUE_AMOUNT: number;
  PROJECT_NAME?: string;
  CLIENT_NAME?: string;
}

export default function EditFixedFeePage() {
  const params = useParams();
  const id = params.id as string;

  const [revenue, setRevenue] = useState<FixedFeeRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const response = await fetch(`/api/fixed-fee/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Revenue entry not found");
          } else {
            throw new Error("Failed to fetch revenue entry");
          }
          return;
        }
        const data = await response.json();
        setRevenue(data);
      } catch (error) {
        console.error("Error fetching revenue entry:", error);
        toast.error("Failed to load revenue entry");
        setError("Failed to load revenue entry");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchRevenue();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !revenue) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Revenue entry not found"}
        </div>
      </AppLayout>
    );
  }

  const formatMonth = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };

  const initialData = {
    project_id: revenue.PROJECT_ID,
    month_date: revenue.MONTH_DATE,
    revenue_amount: revenue.REVENUE_AMOUNT,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Revenue Entry</h1>
          <p className="text-gray-500">
            Update entry for {revenue.PROJECT_NAME || "Project"} - {formatMonth(revenue.MONTH_DATE)}
          </p>
        </div>

        <FixedFeeForm
          mode="edit"
          revenueId={revenue.REVENUE_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
