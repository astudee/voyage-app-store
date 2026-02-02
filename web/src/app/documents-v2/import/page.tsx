"use client";

import { useEffect, useState, useRef } from "react";
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
import { Progress } from "@/components/ui/progress";

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

interface UploadItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "complete" | "error";
  progress: number;
  error?: string;
}

const MAX_CONCURRENT_UPLOADS = 5;

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
    case "r2_scan":
      return "bg-orange-100 text-orange-800";
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
  const [scanning, setScanning] = useState(false);

  // Upload queue state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const activeUploadsRef = useRef(0);
  const uploadIdCounter = useRef(0);

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

  // Process upload queue
  useEffect(() => {
    const processQueue = async () => {
      const queuedItems = uploadQueue.filter((item) => item.status === "queued");
      const availableSlots = MAX_CONCURRENT_UPLOADS - activeUploadsRef.current;

      if (queuedItems.length === 0 || availableSlots <= 0) return;

      const itemsToStart = queuedItems.slice(0, availableSlots);

      for (const item of itemsToStart) {
        activeUploadsRef.current++;
        uploadFile(item);
      }
    };

    processQueue();
  }, [uploadQueue]);

  const uploadFile = async (item: UploadItem) => {
    // Mark as uploading
    setUploadQueue((prev) =>
      prev.map((u) => (u.id === item.id ? { ...u, status: "uploading" as const, progress: 10 } : u))
    );

    try {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("source", "upload");

      // Simulate progress (since fetch doesn't support progress for uploads easily)
      const progressInterval = setInterval(() => {
        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === item.id && u.status === "uploading"
              ? { ...u, progress: Math.min(u.progress + 15, 90) }
              : u
          )
        );
      }, 200);

      const res = await fetch("/api/documents-v2/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      const data = await res.json();

      if (!res.ok && res.status !== 409) {
        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: "error" as const, progress: 100, error: data.error || "Upload failed" }
              : u
          )
        );
      } else if (res.status === 409) {
        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: "error" as const, progress: 100, error: "Duplicate file" }
              : u
          )
        );
      } else {
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: "complete" as const, progress: 100 } : u))
        );
        // Refresh document list
        fetchDocuments();
      }
    } catch (err) {
      setUploadQueue((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? { ...u, status: "error" as const, progress: 100, error: String(err) }
            : u
        )
      );
    } finally {
      activeUploadsRef.current--;
      // Remove completed/errored items after a delay
      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((u) => u.id !== item.id || u.status === "queued" || u.status === "uploading"));
      }, 2000);
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newItems: UploadItem[] = fileArray.map((file) => ({
      id: `upload-${++uploadIdCounter.current}`,
      file,
      status: "queued" as const,
      progress: 0,
    }));

    setUploadQueue((prev) => [...prev, ...newItems]);
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

  const handleScanInbox = async () => {
    setScanning(true);
    try {
      // First do a dry run to see what would be found
      const previewRes = await fetch("/api/documents-v2/scan-inbox");
      const preview = await previewRes.json();

      if (!previewRes.ok) {
        throw new Error(preview.error || "Scan preview failed");
      }

      if (preview.new_files.length === 0) {
        alert("No new files found in import/ folder.");
        return;
      }

      // Confirm before scanning
      if (!confirm(`Found ${preview.new_files.length} new file(s) in R2. Create database records for them?`)) {
        return;
      }

      // Do the actual scan
      const scanRes = await fetch("/api/documents-v2/scan-inbox", {
        method: "POST",
      });
      const scanResult = await scanRes.json();

      if (!scanRes.ok) {
        throw new Error(scanResult.error || "Scan failed");
      }

      alert(`Scan complete: ${scanResult.new_files} new records created, ${scanResult.errors} errors.`);
      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setScanning(false);
    }
  };

  const activeUploads = uploadQueue.filter(
    (u) => u.status === "uploading" || u.status === "queued" || u.status === "complete" || u.status === "error"
  );
  const hasActiveUploads = activeUploads.length > 0;

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
                />
                <Button variant="outline" asChild>
                  <span>Select Files</span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Uploads in Progress Section */}
        {hasActiveUploads && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <h2 className="text-lg font-semibold mb-4">
                Uploading ({uploadQueue.filter((u) => u.status === "uploading").length} active, {uploadQueue.filter((u) => u.status === "queued").length} queued)
              </h2>
              <div className="space-y-3">
                {activeUploads.map((item) => (
                  <div key={item.id} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate" title={item.file.name}>
                          {item.file.name}
                        </span>
                        <span className="text-xs text-gray-500 ml-2 shrink-0">
                          {formatFileSize(item.file.size)}
                        </span>
                      </div>
                      <Progress
                        value={item.progress}
                        className={`h-2 ${
                          item.status === "error"
                            ? "[&>div]:bg-red-500"
                            : item.status === "complete"
                            ? "[&>div]:bg-green-500"
                            : ""
                        }`}
                      />
                      {item.status === "queued" && (
                        <span className="text-xs text-gray-400">Waiting...</span>
                      )}
                      {item.status === "error" && (
                        <span className="text-xs text-red-500">{item.error}</span>
                      )}
                      {item.status === "complete" && (
                        <span className="text-xs text-green-600">Complete</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
            <Button
              variant="outline"
              onClick={handleScanInbox}
              disabled={scanning || loading}
            >
              {scanning ? "Scanning..." : "Scan Inbox"}
            </Button>
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
                No documents awaiting processing. Upload some files above, upload files directly to Cloudflare, or send an email to vault@voyageadvisory.com to get started.
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
