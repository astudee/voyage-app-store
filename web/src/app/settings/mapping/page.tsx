"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ClientNameMapping {
  MAPPING_ID: number;
  BEFORE_NAME: string;
  AFTER_NAME: string;
  SOURCE_SYSTEM: string;
  IS_ACTIVE: boolean;
}

export default function MappingListPage() {
  const [mappings, setMappings] = useState<ClientNameMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    mapping: ClientNameMapping | null;
  }>({ open: false, mapping: null });
  const [deactivating, setDeactivating] = useState(false);
  const [filterSource, setFilterSource] = useState<string>("all");

  const fetchMappings = async () => {
    try {
      const response = await fetch("/api/mapping");
      if (!response.ok) throw new Error("Failed to fetch mappings");
      const data = await response.json();
      setMappings(data);
    } catch (error) {
      console.error("Error fetching mappings:", error);
      toast.error("Failed to load mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleDeactivate = async () => {
    if (!deactivateDialog.mapping) return;

    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/mapping/${deactivateDialog.mapping.MAPPING_ID}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to deactivate mapping");

      toast.success("Mapping has been deactivated");
      setDeactivateDialog({ open: false, mapping: null });
      fetchMappings();
    } catch (error) {
      console.error("Error deactivating mapping:", error);
      toast.error("Failed to deactivate mapping");
    } finally {
      setDeactivating(false);
    }
  };

  const sourceSystems = [...new Set(mappings.map((m) => m.SOURCE_SYSTEM))].sort();

  const filteredMappings =
    filterSource === "all"
      ? mappings
      : mappings.filter((m) => m.SOURCE_SYSTEM === filterSource);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Client Name Mapping</h1>
            <p className="text-gray-500">
              Map client names between systems for consistency
            </p>
          </div>
          <Link href="/settings/mapping/new">
            <Button>Add Mapping</Button>
          </Link>
        </div>

        {sourceSystems.length > 1 && (
          <div className="flex gap-2">
            <Button
              variant={filterSource === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterSource("all")}
            >
              All ({mappings.length})
            </Button>
            {sourceSystems.map((source) => (
              <Button
                key={source}
                variant={filterSource === source ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterSource(source)}
              >
                {source} ({mappings.filter((m) => m.SOURCE_SYSTEM === source).length})
              </Button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {filterSource === "all"
                ? "All Mappings"
                : `${filterSource} Mappings`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filteredMappings.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No mappings found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source System</TableHead>
                    <TableHead>Original Name</TableHead>
                    <TableHead></TableHead>
                    <TableHead>Mapped Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMappings.map((mapping) => (
                    <TableRow key={mapping.MAPPING_ID}>
                      <TableCell>
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
                          {mapping.SOURCE_SYSTEM}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {mapping.BEFORE_NAME}
                      </TableCell>
                      <TableCell className="text-gray-400">→</TableCell>
                      <TableCell className="font-medium text-blue-600">
                        {mapping.AFTER_NAME}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            mapping.IS_ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {mapping.IS_ACTIVE ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/settings/mapping/${mapping.MAPPING_ID}/edit`}
                          >
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          {mapping.IS_ACTIVE && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setDeactivateDialog({
                                  open: true,
                                  mapping: mapping,
                                })
                              }
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={deactivateDialog.open}
        onOpenChange={(open) =>
          setDeactivateDialog({
            open,
            mapping: open ? deactivateDialog.mapping : null,
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Mapping</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate the mapping from{" "}
              <strong>{deactivateDialog.mapping?.BEFORE_NAME}</strong> to{" "}
              <strong>{deactivateDialog.mapping?.AFTER_NAME}</strong>? This
              action can be undone by editing the mapping.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateDialog({ open: false, mapping: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              {deactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
