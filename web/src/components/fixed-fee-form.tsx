"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Project {
  PROJECT_ID: number;
  CLIENT_NAME: string;
  PROJECT_NAME: string;
}

interface FixedFeeFormData {
  project_id: number | null;
  month_date: string;
  revenue_amount: number;
}

interface FixedFeeFormProps {
  mode: "create" | "edit";
  revenueId?: number;
  initialData?: FixedFeeFormData;
}

export function FixedFeeForm({ mode, revenueId, initialData }: FixedFeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [formData, setFormData] = useState<FixedFeeFormData>(
    initialData || {
      project_id: null,
      month_date: "",
      revenue_amount: 0,
    }
  );

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) throw new Error("Failed to fetch projects");
        const data = await response.json();
        setProjects(data);
      } catch (error) {
        console.error("Error fetching projects:", error);
        toast.error("Failed to load projects");
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjects();
  }, []);

  const handleChange = (field: keyof FixedFeeFormData, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url =
        mode === "create" ? "/api/fixed-fee" : `/api/fixed-fee/${revenueId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save");
      }

      toast.success(
        mode === "create"
          ? "Revenue entry created successfully"
          : "Revenue entry updated successfully"
      );
      router.push("/settings/fixed-fee");
    } catch (error) {
      console.error("Error saving revenue entry:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save revenue entry"
      );
    } finally {
      setLoading(false);
    }
  };

  // Format month_date for input (YYYY-MM format)
  const getMonthInputValue = () => {
    if (!formData.month_date) return "";
    // Handle both ISO string and YYYY-MM format
    const date = new Date(formData.month_date);
    if (isNaN(date.getTime())) return formData.month_date;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="project_id">Project *</Label>
            {loadingProjects ? (
              <div className="text-sm text-gray-500">Loading projects...</div>
            ) : (
              <Select
                value={formData.project_id?.toString() || ""}
                onValueChange={(value) =>
                  handleChange("project_id", parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem
                      key={project.PROJECT_ID}
                      value={project.PROJECT_ID.toString()}
                    >
                      {project.CLIENT_NAME} | {project.PROJECT_NAME}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="month_date">Month *</Label>
            <Input
              id="month_date"
              type="month"
              value={getMonthInputValue()}
              onChange={(e) => {
                // Convert YYYY-MM to YYYY-MM-01 for storage
                const value = e.target.value;
                if (value) {
                  handleChange("month_date", `${value}-01`);
                } else {
                  handleChange("month_date", "");
                }
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="revenue_amount">Revenue Amount *</Label>
            <Input
              id="revenue_amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.revenue_amount || ""}
              onChange={(e) =>
                handleChange(
                  "revenue_amount",
                  e.target.value ? parseFloat(e.target.value) : 0
                )
              }
              placeholder="0.00"
              required
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading || !formData.project_id}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Entry"
            : "Update Entry"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/fixed-fee")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
