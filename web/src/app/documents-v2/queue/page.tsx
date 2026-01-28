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
import { Badge } from "@/components/ui/badge";

interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  file_size_bytes: number;
  status: string;
  source: string;
  is_contract: boolean | null;
  ai_model_used: string | null;
  ai_confidence_score: number | null;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSourceBadgeColor(source: string): string {
  switch (source) {
    case "email":
      return "bg-blue-100 text-blue-800";
    case "upload":
      return "bg-green-100 text-green-800";
    case "bulk":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function QueuePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents-v2?status=pending_review");
      if (!res.ok) {
        throw new Error("Failed to fetch documents");
      }
      const data: DocumentsResponse = await res.json();
      setDocuments(data.documents);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleProcess = async (docId: string) => {
    setProcessingIds((prev) => new Set(prev).add(docId));

    try {
      const res = await fetch(`/api/documents-v2/${docId}/process`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Processing failed");
      }

      // Refresh the document list to show updated AI data
      await fetchDocuments();
    } catch (err) {
      alert(`Processing failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleProcessAll = async () => {
    const unprocessedDocs = documents.filter((d) => d.is_contract === null);
    if (unprocessedDocs.length === 0) {
      alert("No unprocessed documents");
      return;
    }

    for (const doc of unprocessedDocs) {
      await handleProcess(doc.id);
    }
  };

  const unprocessedCount = documents.filter((d) => d.is_contract === null).length;
  const processedCount = documents.filter((d) => d.is_contract !== null).length;

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Queue</h1>
            <p className="text-sm text-gray-500">
              Documents awaiting review and classification
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchDocuments} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            {unprocessedCount > 0 && (
              <Button
                variant="outline"
                onClick={handleProcessAll}
                disabled={processingIds.size > 0}
              >
                Process All ({unprocessedCount})
              </Button>
            )}
            <Link href="/documents-v2/upload">
              <Button>Upload Documents</Button>
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Unprocessed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">{unprocessedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                AI Processed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{processedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                From Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {documents.filter((d) => d.source === "email").length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-4 flex gap-2 border-b">
          <Link href="/documents-v2/queue">
            <Button variant="ghost" className="rounded-none border-b-2 border-blue-500">
              Queue
            </Button>
          </Link>
          <Link href="/documents-v2/archive">
            <Button variant="ghost" className="rounded-none">
              Archive
            </Button>
          </Link>
        </div>

        {/* Documents Table */}
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
                No documents pending review.
              </p>
              <div className="mt-4 flex justify-center">
                <Link href="/documents-v2/upload">
                  <Button>Upload Documents</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>AI Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const isProcessing = processingIds.has(doc.id);
                  const isProcessed = doc.is_contract !== null;
                  const confidence = doc.ai_confidence_score
                    ? Math.round(doc.ai_confidence_score * 100)
                    : null;

                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div
                          className="max-w-xs truncate"
                          title={doc.original_filename}
                        >
                          {doc.original_filename}
                        </div>
                      </TableCell>
                      <TableCell>{formatFileSize(doc.file_size_bytes)}</TableCell>
                      <TableCell>
                        <Badge className={getSourceBadgeColor(doc.source)}>
                          {doc.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isProcessing ? (
                          <Badge className="bg-blue-100 text-blue-800">
                            Processing...
                          </Badge>
                        ) : isProcessed ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                doc.is_contract
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-teal-100 text-teal-800"
                              }
                            >
                              {doc.is_contract ? "Contract" : "Document"}
                            </Badge>
                            {confidence !== null && (
                              <span className="text-xs text-gray-500">
                                {confidence}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600">
                            Not processed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(doc.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!isProcessed && !isProcessing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleProcess(doc.id)}
                            >
                              Process
                            </Button>
                          )}
                          <Link href={`/documents-v2/review/${doc.id}`}>
                            <Button variant="ghost" size="sm">
                              Review
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
