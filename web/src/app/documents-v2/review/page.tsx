"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Document {
  id: string;
  original_filename: string;
  is_contract: boolean | null;
  document_category: string | null;
  contract_type: string | null;
  party: string | null;
  sub_party: string | null;
  executed_date: string | null;
  issuer_category: string | null;
  document_type: string | null;
  period_end_date: string | null;
  letter_date: string | null;
  ai_confidence_score: number | null;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getPartyDisplay(doc: Document): string {
  if (!doc.party) return "-";
  return doc.sub_party ? `${doc.party} (${doc.sub_party})` : doc.party;
}

function getTypeDisplay(doc: Document): string {
  if (doc.is_contract) {
    return doc.contract_type || "-";
  }
  return doc.document_type || "-";
}

function getDateDisplay(doc: Document): string {
  if (doc.is_contract) {
    return formatDate(doc.executed_date);
  }
  return formatDate(doc.letter_date || doc.period_end_date);
}

export default function ReviewPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents-v2?status=pending_approval");
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

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;

    setApproving(true);
    try {
      const res = await fetch("/api/documents-v2/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Approve failed");
      }

      setSelectedIds(new Set());
      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setApproving(false);
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

  const handleApproveOne = async (id: string) => {
    try {
      const res = await fetch("/api/documents-v2/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", ids: [id] }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Approve failed");
      }

      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Delete this document?")) return;

    try {
      const res = await fetch("/api/documents-v2/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: [id] }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      fetchDocuments();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    // Don't navigate if clicking on checkbox or dropdown
    if ((e.target as HTMLElement).closest('[data-no-navigate]')) {
      return;
    }
    router.push(`/documents-v2/review/${id}`);
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2 border-b">
          <Link href="/documents-v2/import">
            <Button variant="ghost" className="rounded-none">
              Import
            </Button>
          </Link>
          <Link href="/documents-v2/review">
            <Button variant="ghost" className="rounded-none border-b-2 border-blue-500">
              Review ({documents.length})
            </Button>
          </Link>
          <Link href="/documents-v2/archive">
            <Button variant="ghost" className="rounded-none">
              Archive
            </Button>
          </Link>
        </div>

        {/* Actions Bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2" data-no-navigate>
            <Checkbox
              checked={selectedIds.size === documents.length && documents.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-gray-500">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select All"}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  onClick={handleApproveSelected}
                  disabled={approving || deleting}
                >
                  {approving ? "Approving..." : `Approve Selected (${selectedIds.size})`}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  disabled={approving || deleting}
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
                No documents pending approval.
              </p>
              <div className="mt-4 flex justify-center">
                <Link href="/documents-v2/import">
                  <Button>Go to Import</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" data-no-navigate></TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-10" data-no-navigate></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={(e) => handleRowClick(e, doc.id)}
                  >
                    <TableCell data-no-navigate>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{getPartyDisplay(doc)}</span>
                        <span className="text-xs text-gray-500 truncate max-w-md" title={doc.original_filename}>
                          {doc.original_filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          doc.is_contract
                            ? "bg-purple-100 text-purple-800"
                            : "bg-teal-100 text-teal-800"
                        }
                      >
                        {getTypeDisplay(doc)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {getDateDisplay(doc)}
                    </TableCell>
                    <TableCell data-no-navigate>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ⋮
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/documents-v2/review/${doc.id}`)}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleApproveOne(doc.id)}>
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteOne(doc.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
