"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UploadResult {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  status: string;
  error?: string;
  duplicate_of_id?: string;
  duplicate_filename?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setError(null);
    const newResults: UploadResult[] = [];

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

        if (res.ok) {
          newResults.push({
            id: data.id,
            original_filename: file.name,
            file_size_bytes: file.size,
            status: "success",
          });
        } else if (res.status === 409) {
          newResults.push({
            id: data.duplicate_of_id,
            original_filename: file.name,
            file_size_bytes: file.size,
            status: "duplicate",
            duplicate_of_id: data.duplicate_of_id,
            duplicate_filename: data.duplicate_filename,
          });
        } else {
          newResults.push({
            id: "",
            original_filename: file.name,
            file_size_bytes: file.size,
            status: "error",
            error: data.error || "Upload failed",
          });
        }
      } catch {
        newResults.push({
          id: "",
          original_filename: file.name,
          file_size_bytes: file.size,
          status: "error",
          error: "Network error",
        });
      }
    }

    setResults((prev) => [...prev, ...newResults]);
    setUploading(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const duplicateCount = results.filter((r) => r.status === "duplicate").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
            <p className="text-sm text-gray-500">
              Upload files for AI classification and archival
            </p>
          </div>
          <Link href="/documents-v2/queue">
            <Button variant="outline">Back to Queue</Button>
          </Link>
        </div>

        {/* Upload Area */}
        <Card className="mb-6">
          <CardContent className="py-8">
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="mb-2 text-lg font-medium text-gray-900">
                {isDragging ? "Drop files here" : "Drag and drop files here"}
              </p>
              <p className="mb-4 text-sm text-gray-500">or</p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <Button disabled={uploading}>
                  {uploading ? "Uploading..." : "Select Files"}
                </Button>
              </label>
              <p className="mt-4 text-xs text-gray-400">
                Supported formats: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="py-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Upload Results</span>
                <div className="flex gap-4 text-sm font-normal">
                  {successCount > 0 && (
                    <span className="text-green-600">{successCount} uploaded</span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="text-yellow-600">{duplicateCount} duplicates</span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-red-600">{errorCount} failed</span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      result.status === "success"
                        ? "border-green-200 bg-green-50"
                        : result.status === "duplicate"
                        ? "border-yellow-200 bg-yellow-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {result.original_filename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(result.file_size_bytes)}
                        {result.status === "duplicate" && result.duplicate_filename && (
                          <span className="ml-2">
                            (duplicate of: {result.duplicate_filename})
                          </span>
                        )}
                        {result.status === "error" && result.error && (
                          <span className="ml-2 text-red-600">{result.error}</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-4">
                      {result.status === "success" && (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Uploaded
                        </span>
                      )}
                      {result.status === "duplicate" && (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          Duplicate
                        </span>
                      )}
                      {result.status === "error" && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                          Failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setResults([])}
                >
                  Clear Results
                </Button>
                {successCount > 0 && (
                  <Button onClick={() => router.push("/documents-v2/queue")}>
                    View Queue ({successCount} new)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
