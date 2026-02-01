"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface Document {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  source: string;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function getSourceBadgeColor(source: string): string {
  switch (source) {
    case "email":
      return "bg-blue-100 text-blue-800";
    case "upload":
      return "bg-green-100 text-green-800";
    case "to-file":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function ImportPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents-v2?status=uploaded");
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: DocumentsResponse = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setError(null);

    for (const file of fileArray) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("source", "upload");

        const res = await fetch("/api/documents-v2/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok && res.status !== 409) {
          console.error("Upload failed:", data.error || data);
          setError(`Upload failed: ${data.error || "Unknown error"}`);
        } else if (res.status === 409) {
          console.log("Duplicate file:", data.duplicate_filename);
        } else {
          console.log("Upload success:", data.id);
        }
      } catch (err) {
        console.error("Upload error:", err);
        setError(`Upload error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    setUploading(false);
    await fetchDocuments();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleProcessSelected = async () => {
    if (selectedIds.size === 0) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/documents-v2/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Processing failed");
      }

      alert(`Processed ${data.processed} document(s). ${data.failed} failed.`);
      setSelectedIds(new Set());
      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} document(s)?`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/documents-v2/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }

      setSelectedIds(new Set());
      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2 border-b">
          <Link href="/documents-v2/import">
            <Button variant="ghost" className="rounded-none border-b-2 border-blue-500">
              Import
            </Button>
          </Link>
          <Link href="/documents-v2/review">
            <Button variant="ghost" className="rounded-none">
              Review
            </Button>
          </Link>
          <Link href="/documents-v2/archive">
            <Button variant="ghost" className="rounded-none">
              Archive
            </Button>
          </Link>
        </div>

        {/* Upload Area */}
        <Card className="mb-6">
          <CardContent className="py-6">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <p className="mb-2 text-lg font-medium text-gray-900">
                {isDragging ? "Drop files here" : "Drag and drop PDF files here, or click to browse"}
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <Button variant="outline" disabled={uploading}>
                  {uploading ? "Uploading..." : "Select Files"}
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Document List Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Awaiting Processing ({documents.length})
          </h2>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  onClick={handleProcessSelected}
                  disabled={processing || deleting}
                >
                  {processing ? "Processing..." : `Process Selected (${selectedIds.size})`}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  disabled={processing || deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={fetchDocuments} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Document List */}
        {error ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-red-500">{error}</p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={fetchDocuments}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">Loading documents...</p>
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                No documents awaiting processing. Upload some files above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === documents.length && documents.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="w-20">Source</TableHead>
                  <TableHead className="w-32">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-md" title={doc.original_filename}>
                          {doc.original_filename}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatFileSize(doc.file_size_bytes)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getSourceBadgeColor(doc.source)}>
                        {doc.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatRelativeTime(doc.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
