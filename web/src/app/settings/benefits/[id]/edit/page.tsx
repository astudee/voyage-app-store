"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { BenefitForm } from "@/components/benefits-form";
import { toast } from "sonner";

interface Benefit {
  BENEFIT_ID: number;
  DESCRIPTION: string;
  CODE: string;
  BENEFIT_TYPE: string;
  IS_FORMULA_BASED: boolean;
  TOTAL_MONTHLY_COST: number | null;
  EE_MONTHLY_COST: number | null;
  FIRM_MONTHLY_COST: number | null;
  COVERAGE_PERCENTAGE: number | null;
  MAX_WEEKLY_BENEFIT: number | null;
  MAX_MONTHLY_BENEFIT: number | null;
  RATE_PER_UNIT: number | null;
  IS_ACTIVE: boolean;
}

export default function EditBenefitPage() {
  const params = useParams();
  const id = params.id as string;

  const [benefit, setBenefit] = useState<Benefit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBenefit = async () => {
      try {
        const response = await fetch(`/api/benefits/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Benefit not found");
          } else {
            throw new Error("Failed to fetch benefit");
          }
          return;
        }
        const data = await response.json();
        setBenefit(data);
      } catch (error) {
        console.error("Error fetching benefit:", error);
        toast.error("Failed to load benefit");
        setError("Failed to load benefit");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchBenefit();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !benefit) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Benefit not found"}
        </div>
      </AppLayout>
    );
  }

  const initialData = {
    description: benefit.DESCRIPTION,
    code: benefit.CODE,
    benefit_type: benefit.BENEFIT_TYPE,
    is_formula_based: benefit.IS_FORMULA_BASED,
    total_monthly_cost: benefit.TOTAL_MONTHLY_COST?.toString() || "",
    ee_monthly_cost: benefit.EE_MONTHLY_COST?.toString() || "",
    firm_monthly_cost: benefit.FIRM_MONTHLY_COST?.toString() || "",
    coverage_percentage: benefit.COVERAGE_PERCENTAGE?.toString() || "",
    max_weekly_benefit: benefit.MAX_WEEKLY_BENEFIT?.toString() || "",
    max_monthly_benefit: benefit.MAX_MONTHLY_BENEFIT?.toString() || "",
    rate_per_unit: benefit.RATE_PER_UNIT?.toString() || "",
    is_active: benefit.IS_ACTIVE,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Benefit</h1>
          <p className="text-gray-500">
            Update {benefit.CODE} - {benefit.DESCRIPTION}
          </p>
        </div>

        <BenefitForm
          mode="edit"
          benefitId={benefit.BENEFIT_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
