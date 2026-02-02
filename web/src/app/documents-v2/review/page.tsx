"use client";

import { useEffect, useState, useMemo } from "react";
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
import { Progress } from "@/components/ui/progress";
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
  document_type_category: "contract" | "document" | "invoice" | null;
  document_category: string | null;
  contract_type: string | null;
  party: string | null;
  sub_party: string | null;
  document_date: string | null;
  executed_date: string | null;
  issuer_category: string | null;
  document_type: string | null;
  period_end_date: string | null;
  letter_date: string | null;
  due_date: string | null;
  amount: number | null;
  notes: string | null;
  ai_confidence_score: number | null;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 100;

type SortKey = "party" | "date" | "type" | "notes";
type SortDir = "asc" | "desc" | null;

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
  const category = doc.document_type_category;
  if (category === "contract" || doc.is_contract) {
    return doc.contract_type || "Contract";
  }
  if (category === "invoice") {
    return doc.amount ? `Invoice $${doc.amount.toLocaleString()}` : "Invoice";
  }
  return doc.document_type || "Document";
}

function getDateDisplay(doc: Document): string {
  // Use unified document_date first, then fall back to legacy fields
  if (doc.document_date) {
    return formatDate(doc.document_date);
  }
  // Legacy fallback
  const category = doc.document_type_category;
  if (category === "contract" || doc.is_contract) {
    return formatDate(doc.executed_date);
  }
  if (category === "invoice") {
    return formatDate(doc.due_date);
  }
  return formatDate(doc.letter_date || doc.period_end_date);
}

function getDateValue(doc: Document): Date | null {
  // Use unified document_date first
  if (doc.document_date) {
    return new Date(doc.document_date);
  }
  // Legacy fallback
  const category = doc.document_type_category;
  if (category === "contract" || doc.is_contract) {
    return doc.executed_date ? new Date(doc.executed_date) : null;
  }
  if (category === "invoice") {
    return doc.due_date ? new Date(doc.due_date) : null;
  }
  const dateStr = doc.letter_date || doc.period_end_date;
  return dateStr ? new Date(dateStr) : null;
}

function getTypeBadgeColor(doc: Document): string {
  const category = doc.document_type_category;
  if (category === "contract" || doc.is_contract) {
    return "bg-purple-100 text-purple-800";
  }
  if (category === "invoice") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-teal-100 text-teal-800";
}

export default function ReviewPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approvingProgress, setApprovingProgress] = useState({ current: 0, total: 0, currentFile: "" });
  const [deleting, setDeleting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const totalPages = Math.ceil(totalDocuments / PAGE_SIZE);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    if (!sortKey || !sortDir) return documents;

    return [...documents].sort((a, b) => {
      let aVal: string | number | Date | null = null;
      let bVal: string | number | Date | null = null;

      switch (sortKey) {
        case "party":
          aVal = getPartyDisplay(a).toLowerCase();
          bVal = getPartyDisplay(b).toLowerCase();
          break;
        case "date":
          aVal = getDateValue(a);
          bVal = getDateValue(b);
          break;
        case "type":
          aVal = getTypeDisplay(a).toLowerCase();
          bVal = getTypeDisplay(b).toLowerCase();
          break;
        case "notes":
          aVal = (a.notes || "").toLowerCase();
          bVal = (b.notes || "").toLowerCase();
          break;
      }

      // Handle nulls
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortDir === "asc" ? 1 : -1;
      if (bVal === null) return sortDir === "asc" ? -1 : 1;

      // Compare dates
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDir === "asc"
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      // Compare strings
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return 0;
    });
  }, [documents, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Cycle: asc -> desc -> none
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const fetchDocuments = async (page: number = currentPage) => {
    try {
      setLoading(true);
      setError(null);
      const offset = (page - 1) * PAGE_SIZE;
      const res = await fetch(`/api/documents-v2?status=pending_approval&limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: DocumentsResponse = await res.json();
      setDocuments(data.documents);
      setTotalDocuments(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments(currentPage);
  }, [currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    setSelectedIds(new Set()); // Clear selections when changing pages
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

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    setApproving(true);
    setApprovingProgress({ current: 0, total: ids.length, currentFile: "" });

    let approved = 0;
    let failed = 0;

    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const doc = documents.find(d => d.id === id);
        setApprovingProgress({
          current: i + 1,
          total: ids.length,
          currentFile: doc?.party || doc?.original_filename || id
        });

        try {
          const res = await fetch("/api/documents-v2/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve", ids: [id] }),
          });

          if (res.ok) {
            approved++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      if (failed > 0) {
        alert(`Archived ${approved} document(s). ${failed} failed.`);
      }
      setSelectedIds(new Set());
      fetchDocuments(currentPage);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setApproving(false);
      setApprovingProgress({ current: 0, total: 0, currentFile: "" });
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
      fetchDocuments(currentPage);
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

      fetchDocuments(currentPage);
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

      fetchDocuments(currentPage);
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
              Review ({totalDocuments})
            </Button>
          </Link>
          <Link href="/documents-v2/archive">
            <Button variant="ghost" className="rounded-none">
              Archive
            </Button>
          </Link>
        </div>

        {/* Archiving Progress */}
        {approving && approvingProgress.total > 0 && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <h2 className="text-lg font-semibold mb-2">
                Archiving Documents ({approvingProgress.current} of {approvingProgress.total})
              </h2>
              <Progress
                value={(approvingProgress.current / approvingProgress.total) * 100}
                className="h-3 mb-2"
              />
              <p className="text-sm text-gray-500 truncate">
                {approvingProgress.currentFile}
              </p>
            </CardContent>
          </Card>
        )}

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
            <Button variant="outline" onClick={() => fetchDocuments(currentPage)} disabled={loading}>
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
                <Button variant="outline" onClick={() => fetchDocuments(currentPage)}>
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
                  <TableHead
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("party")}
                  >
                    Party{getSortIndicator("party")}
                  </TableHead>
                  <TableHead
                    className="w-28 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("date")}
                  >
                    Date{getSortIndicator("date")}
                  </TableHead>
                  <TableHead
                    className="w-32 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("type")}
                  >
                    Type{getSortIndicator("type")}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("notes")}
                  >
                    Notes{getSortIndicator("notes")}
                  </TableHead>
                  <TableHead className="w-10" data-no-navigate></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDocuments.map((doc) => (
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
                      <span className="font-medium">{getPartyDisplay(doc)}</span>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {getDateDisplay(doc)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadgeColor(doc)}>
                        {getTypeDisplay(doc)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm max-w-xs">
                      <span className="line-clamp-2" title={doc.notes || ""}>
                        {doc.notes || "-"}
                      </span>
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

        {/* Pagination */}
        {totalDocuments > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, totalDocuments)} of {totalDocuments}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
