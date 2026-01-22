"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { MappingForm } from "@/components/mapping-form";
import { toast } from "sonner";

interface ClientNameMapping {
  MAPPING_ID: number;
  BEFORE_NAME: string;
  AFTER_NAME: string;
  SOURCE_SYSTEM: string;
  IS_ACTIVE: boolean;
}

export default function EditMappingPage() {
  const params = useParams();
  const id = params.id as string;

  const [mapping, setMapping] = useState<ClientNameMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMapping = async () => {
      try {
        const response = await fetch(`/api/mapping/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Mapping not found");
          } else {
            throw new Error("Failed to fetch mapping");
          }
          return;
        }
        const data = await response.json();
        setMapping(data);
      } catch (error) {
        console.error("Error fetching mapping:", error);
        toast.error("Failed to load mapping");
        setError("Failed to load mapping");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchMapping();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !mapping) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Mapping not found"}
        </div>
      </AppLayout>
    );
  }

  const initialData = {
    before_name: mapping.BEFORE_NAME,
    after_name: mapping.AFTER_NAME,
    source_system: mapping.SOURCE_SYSTEM,
    is_active: mapping.IS_ACTIVE,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Mapping</h1>
          <p className="text-gray-500">
            Update mapping: {mapping.BEFORE_NAME} → {mapping.AFTER_NAME}
          </p>
        </div>

        <MappingForm
          mode="edit"
          mappingId={mapping.MAPPING_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
