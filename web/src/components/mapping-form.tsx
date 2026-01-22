"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface MappingFormData {
  before_name: string;
  after_name: string;
  source_system: string;
  is_active: boolean;
}

interface MappingFormProps {
  initialData?: MappingFormData;
  mappingId?: number;
  mode: "create" | "edit";
}

const SOURCE_SYSTEMS = [
  "QuickBooks",
  "BigTime",
  "Salesforce",
  "Other",
];

export function MappingForm({ initialData, mappingId, mode }: MappingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<MappingFormData>(
    initialData || {
      before_name: "",
      after_name: "",
      source_system: "QuickBooks",
      is_active: true,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        before_name: formData.before_name,
        after_name: formData.after_name,
        source_system: formData.source_system,
        is_active: formData.is_active,
      };

      const url =
        mode === "create" ? "/api/mapping" : `/api/mapping/${mappingId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save mapping");
      }

      toast.success(
        mode === "create"
          ? "Mapping created successfully"
          : "Mapping updated successfully"
      );
      router.push("/settings/mapping");
    } catch (error) {
      console.error("Error saving mapping:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save mapping"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof MappingFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mapping Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="source_system">Source System *</Label>
            <Select
              value={formData.source_system}
              onValueChange={(value) => handleChange("source_system", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_SYSTEMS.map((system) => (
                  <SelectItem key={system} value={system}>
                    {system}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="is_active">Status</Label>
            <Select
              value={formData.is_active ? "true" : "false"}
              onValueChange={(value) =>
                handleChange("is_active", value === "true")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="before_name">Original Name (Before) *</Label>
            <Input
              id="before_name"
              value={formData.before_name}
              onChange={(e) => handleChange("before_name", e.target.value)}
              placeholder="e.g., PayIt, LLC"
              required
            />
            <p className="text-xs text-gray-500">
              The client name as it appears in the source system
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="after_name">Mapped Name (After) *</Label>
            <Input
              id="after_name"
              value={formData.after_name}
              onChange={(e) => handleChange("after_name", e.target.value)}
              placeholder="e.g., PayIt LLC"
              required
            />
            <p className="text-xs text-gray-500">
              The standardized client name to use
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/mapping")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Mapping"
            : "Update Mapping"}
        </Button>
      </div>
    </form>
  );
}
