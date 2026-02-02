"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type SortKey = "party" | "type" | "date" | "notes";
type SortDir = "asc" | "desc" | null;

interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  document_type_category: "contract" | "document" | "invoice" | null;
  is_contract: boolean | null; // Legacy
  document_category: string | null;
  contract_type: string | null;
  party: string | null;
  sub_party: string | null;
  document_type: string | null;
  ai_summary: string | null;
  document_date: string | null;
  executed_date: string | null;
  letter_date: string | null;
  period_end_date: string | null;
  amount: number | null;
  due_date: string | null;
  invoice_type: string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 100;

interface SearchResponse {
  results: Document[];
  total: number;
  query: string;
  search_type?: string;
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
  if (doc.document_type_category === "contract" || doc.is_contract) {
    return doc.contract_type || "Contract";
  }
  if (doc.document_type_category === "invoice") {
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
  if (doc.document_type_category === "contract" || doc.is_contract) {
    return formatDate(doc.executed_date);
  }
  if (doc.document_type_category === "invoice") {
    return formatDate(doc.due_date);
  }
  return formatDate(doc.letter_date || doc.period_end_date);
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

export default function ArchivePage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [displayedDocuments, setDisplayedDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSmartSearch, setIsSmartSearch] = useState(false);
  const [searchType, setSearchType] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);

  // Sort displayed documents
  const sortedDocuments = useMemo(() => {
    if (!sortKey || !sortDir) return displayedDocuments;

    return [...displayedDocuments].sort((a, b) => {
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
  }, [displayedDocuments, sortKey, sortDir]);

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

  const fetchDocuments = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      const offset = (page - 1) * PAGE_SIZE;
      const res = await fetch(`/api/documents-v2?status=archived&limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: DocumentsResponse = await res.json();
      setDocuments(data.documents);
      setDisplayedDocuments(data.documents);
      setTotalDocuments(data.total);
      setCurrentPage(page);
      setSearchType(null);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalDocuments / PAGE_SIZE);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      fetchDocuments(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      fetchDocuments(currentPage + 1);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Selection handlers
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
    if (selectedIds.size === sortedDocuments.length && sortedDocuments.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedDocuments.map((d) => d.id)));
    }
  };

  // Parse boolean query into terms and phrases
  const parseQuery = (queryStr: string): { mustMatch: string[]; mustNotMatch: string[]; isAnd: boolean } => {
    const mustMatch: string[] = [];
    const mustNotMatch: string[] = [];

    // Check if AND is used (case insensitive)
    const hasAnd = /\bAND\b/i.test(queryStr);
    const isAnd = hasAnd;

    // Remove AND/OR operators for parsing
    let cleaned = queryStr.replace(/\b(AND|OR)\b/gi, " ");

    // Extract quoted phrases
    const phraseRegex = /"([^"]+)"/g;
    let match;
    while ((match = phraseRegex.exec(cleaned)) !== null) {
      mustMatch.push(match[1].toLowerCase());
    }
    cleaned = cleaned.replace(phraseRegex, " ");

    // Extract NOT terms (prefixed with - or NOT)
    const notRegex = /(?:NOT\s+|-)([\w]+)/gi;
    while ((match = notRegex.exec(cleaned)) !== null) {
      mustNotMatch.push(match[1].toLowerCase());
    }
    cleaned = cleaned.replace(notRegex, " ");

    // Extract remaining terms
    const terms = cleaned
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    mustMatch.push(...terms);

    return { mustMatch, mustNotMatch, isAnd };
  };

  // Local text filtering (instant) with boolean support
  const performLocalFilter = useCallback(
    (term: string) => {
      if (!term) {
        setDisplayedDocuments(documents);
        setSearchType(null);
        return;
      }

      const { mustMatch, mustNotMatch, isAnd } = parseQuery(term);

      const filtered = documents.filter((doc) => {
        const searchableText = [
          doc.party,
          doc.sub_party,
          doc.original_filename,
          doc.contract_type,
          doc.document_type,
          doc.ai_summary,
          doc.notes,
          doc.document_date,
          doc.amount?.toString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        // Check for must-not-match terms
        for (const notTerm of mustNotMatch) {
          if (searchableText.includes(notTerm)) {
            return false;
          }
        }

        // Check for must-match terms
        let matchedCount = 0;
        for (const matchTerm of mustMatch) {
          if (searchableText.includes(matchTerm)) {
            matchedCount++;
          }
        }

        // For AND queries, all terms must match
        if (isAnd) {
          return matchedCount === mustMatch.length;
        }

        // For OR queries (default), at least one term must match
        return matchedCount > 0;
      });

      setDisplayedDocuments(filtered);
      setSearchType("local");
      setSelectedIds(new Set()); // Clear selection on filter
    },
    [documents]
  );

  // AI-powered search
  const performSmartSearch = async (query: string) => {
    if (!query || query.length < 2) {
      setDisplayedDocuments(documents);
      setSearchType(null);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const res = await fetch("/api/documents-v2/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      });

      const data: SearchResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.query || "Search failed");
      }

      setDisplayedDocuments(data.results);
      setSearchType(data.search_type || "ai");
      setSelectedIds(new Set()); // Clear selection on search
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setDisplayedDocuments([]);
    } finally {
      setSearching(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    if (!isSmartSearch) {
      performLocalFilter(value);
    }
  };

  // Handle search submit (for smart search)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSmartSearch && searchTerm) {
      performSmartSearch(searchTerm);
    }
  };

  // Toggle smart search
  const toggleSmartSearch = () => {
    const newValue = !isSmartSearch;
    setIsSmartSearch(newValue);

    if (newValue) {
      // Switching to smart search - clear results until user searches
      if (searchTerm) {
        performSmartSearch(searchTerm);
      }
    } else {
      // Switching to local filter
      performLocalFilter(searchTerm);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    setDisplayedDocuments(documents);
    setSearchType(null);
    setSelectedIds(new Set());
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

  const handleDownload = async (doc: Document) => {
    try {
      // Use the download endpoint for proper Content-Disposition
      window.location.href = `/api/documents-v2/${doc.id}/download`;
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return;

    // Download each selected document
    for (const id of selectedIds) {
      const doc = sortedDocuments.find((d) => d.id === id);
      if (doc) {
        // Create a temporary link for each download
        const link = document.createElement("a");
        link.href = `/api/documents-v2/${id}/download`;
        link.download = "";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    // Don't navigate if clicking on checkbox or dropdown
    if ((e.target as HTMLElement).closest("[data-no-navigate]")) {
      return;
    }
    router.push(`/documents-v2/review/${id}`);
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex items-center justify-between border-b">
          <div className="flex gap-2">
            <Link href="/documents-v2/import">
              <Button variant="ghost" className="rounded-none">
                Import
              </Button>
            </Link>
            <Link href="/documents-v2/review">
              <Button variant="ghost" className="rounded-none">
                Review
              </Button>
            </Link>
            <Link href="/documents-v2/archive">
              <Button variant="ghost" className="rounded-none border-b-2 border-blue-500">
                Archive ({totalDocuments})
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <form onSubmit={handleSearchSubmit} className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <Input
                  placeholder={
                    isSmartSearch
                      ? "AI search: 'contracts with ECS from 2025 that are modifications'"
                      : 'Boolean filter: "ECS Federal" AND MOD, invoice -cancelled'
                  }
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pr-20"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant={isSmartSearch ? "default" : "outline"}
                onClick={toggleSmartSearch}
                className="whitespace-nowrap"
              >
                {isSmartSearch ? "✨ Smart Search" : "Smart Search"}
              </Button>
              {isSmartSearch && (
                <Button type="submit" disabled={searching || !searchTerm}>
                  {searching ? "Searching..." : "Search"}
                </Button>
              )}
            </form>
            <div className="mt-2 text-xs text-gray-500">
              {searchType ? (
                <>
                  {searchType === "ai" && "AI-powered semantic search"}
                  {searchType === "text" && "Text-based search (AI unavailable)"}
                  {searchType === "local" && "Instant filter"}
                  {displayedDocuments.length > 0 && ` • ${displayedDocuments.length} results`}
                </>
              ) : (
                <>
                  {isSmartSearch
                    ? "Natural language search using AI. Press Search to find documents."
                    : 'Tips: Use "quoted phrases" for exact match, AND for all terms, -term to exclude'}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions Bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2" data-no-navigate>
            <Checkbox
              checked={selectedIds.size === sortedDocuments.length && sortedDocuments.length > 0}
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
                  variant="outline"
                  onClick={handleDownloadSelected}
                >
                  Download Selected ({selectedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  disabled={deleting}
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
                <Button variant="outline" onClick={() => fetchDocuments()}>
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
        ) : displayedDocuments.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                {searchTerm
                  ? "No documents match your search."
                  : "No archived documents yet."}
              </p>
              {searchTerm && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={clearSearch}>
                    Clear Search
                  </Button>
                </div>
              )}
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
                    <TableCell className="text-gray-600">{getDateDisplay(doc)}</TableCell>
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
                          <DropdownMenuItem onClick={() => handleDownload(doc)}>
                            Download
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
            {/* Pagination Controls */}
            {totalPages > 1 && !searchTerm && (
              <div className="flex items-center justify-between border-t p-4">
                <div className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, totalDocuments)} of {totalDocuments}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1 || loading}
                  >
                    ← Previous
                  </Button>
                  <span className="text-sm text-gray-600 px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || loading}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
