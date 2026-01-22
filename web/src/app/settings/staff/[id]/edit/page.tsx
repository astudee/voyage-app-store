"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { StaffForm } from "@/components/staff-form";
import { toast } from "sonner";

interface Staff {
  STAFF_ID: number;
  STAFF_NAME: string;
  START_DATE: string | null;
  SALARY: number | null;
  UTILIZATION_BONUS_TARGET: number | null;
  OTHER_BONUS_TARGET: number | null;
  MEDICAL_PLAN_CODE: string | null;
  DENTAL_PLAN_CODE: string | null;
  VISION_PLAN_CODE: string | null;
  STD_CODE: string | null;
  LTD_CODE: string | null;
  LIFE_CODE: string | null;
  ADDL_LIFE_CODE: string | null;
  PHONE_ALLOWANCE: number | null;
  STAFF_TYPE: string | null;
  NOTES: string | null;
  IS_ACTIVE: boolean;
  BIGTIME_STAFF_ID: number | null;
}

export default function EditStaffPage() {
  const params = useParams();
  const id = params.id as string;

  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const response = await fetch(`/api/staff/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Staff member not found");
          } else {
            throw new Error("Failed to fetch staff member");
          }
          return;
        }
        const data = await response.json();
        setStaff(data);
      } catch (error) {
        console.error("Error fetching staff:", error);
        toast.error("Failed to load staff member");
        setError("Failed to load staff member");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchStaff();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !staff) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Staff member not found"}
        </div>
      </AppLayout>
    );
  }

  // Convert Staff to form data format
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  const initialData = {
    staff_name: staff.STAFF_NAME,
    start_date: formatDate(staff.START_DATE),
    salary: staff.SALARY?.toString() || "",
    utilization_bonus_target: staff.UTILIZATION_BONUS_TARGET?.toString() || "",
    other_bonus_target: staff.OTHER_BONUS_TARGET?.toString() || "",
    medical_plan_code: staff.MEDICAL_PLAN_CODE || "",
    dental_plan_code: staff.DENTAL_PLAN_CODE || "",
    vision_plan_code: staff.VISION_PLAN_CODE || "",
    std_code: staff.STD_CODE || "",
    ltd_code: staff.LTD_CODE || "",
    life_code: staff.LIFE_CODE || "",
    addl_life_code: staff.ADDL_LIFE_CODE || "",
    phone_allowance: staff.PHONE_ALLOWANCE?.toString() || "",
    staff_type: staff.STAFF_TYPE || "",
    notes: staff.NOTES || "",
    is_active: staff.IS_ACTIVE,
    bigtime_staff_id: staff.BIGTIME_STAFF_ID?.toString() || "",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Staff Member</h1>
          <p className="text-gray-500">Update {staff.STAFF_NAME}</p>
        </div>

        <StaffForm
          mode="edit"
          staffId={staff.STAFF_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
