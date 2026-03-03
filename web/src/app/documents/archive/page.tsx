"use client";

import { useEffect, useState } from "react";
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

type SortKey = "party" | "type" | "date" | "notes" | "uploaded";
type SortDir = "asc" | "desc" | null;

interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  document_type_category: "contract" | "document" | "invoice" | null;
  is_contract: boolean | null;
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

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  if (doc.document_date) return formatDate(doc.document_date);
  if (doc.document_type_category === "contract" || doc.is_contract) return formatDate(doc.executed_date);
  if (doc.document_type_category === "invoice") return formatDate(doc.due_date);
  return formatDate(doc.letter_date || doc.period_end_date);
}

function getTypeBadgeColor(doc: Document): string {
  const category = doc.document_type_category;
  if (category === "contract" || doc.is_contract) return "bg-purple-100 text-purple-800";
  if (category === "invoice") return "bg-amber-100 text-amber-800";
  return "bg-teal-100 text-teal-800";
}

export default function ArchivePage() {
  const router = useRouter();
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  // Track whether we're showing search results or paginated browse
  const [isSearchResults, setIsSearchResults] = useState(false);

  const handleSort = (key: SortKey) => {
    if (isSearchResults) return; // Don't re-sort search results
    let newKey: SortKey | null = key;
    let newDir: SortDir;
    if (sortKey === key) {
      if (sortDir === "asc") {
        newDir = "desc";
      } else {
        newKey = null;
        newDir = null;
      }
    } else {
      newDir = "asc";
    }
    setSortKey(newKey);
    setSortDir(newDir);
    setCurrentPage(1);
    fetchDocuments(1, newKey, newDir);
  };

  const getSortIndicator = (key: SortKey) => {
    if (isSearchResults) return null;
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const fetchDocuments = async (page: number = 1, overrideSortKey?: SortKey | null, overrideSortDir?: SortDir) => {
    try {
      setLoading(true);
      setError(null);
      const offset = (page - 1) * PAGE_SIZE;
      const sk = overrideSortKey !== undefined ? overrideSortKey : sortKey;
      const sd = overrideSortDir !== undefined ? overrideSortDir : sortDir;
      let url = `/api/documents?status=archived&limit=${PAGE_SIZE}&offset=${offset}`;
      if (sk && sd) {
        url += `&sortBy=${sk}&sortDir=${sd}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: DocumentsResponse = await res.json();
      setDisplayedDocuments(data.documents);
      setTotalDocuments(data.total);
      setCurrentPage(page);
      setSearchType(null);
      setIsSearchResults(false);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalDocuments / PAGE_SIZE);

  const handlePrevPage = () => {
    if (currentPage > 1) fetchDocuments(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) fetchDocuments(currentPage + 1);
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedDocuments.length && displayedDocuments.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedDocuments.map((d) => d.id)));
    }
  };

  // Perform search (both modes go to server)
  const performSearch = async (query: string, smart: boolean) => {
    if (!query || query.trim().length < 2) {
      // Clear search, go back to browse mode
      fetchDocuments(1);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const res = await fetch("/api/documents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, mode: smart ? "ai" : "text" }),
      });

      const data: SearchResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.query || "Search failed");
      }

      setDisplayedDocuments(data.results);
      setTotalDocuments(data.total);
      setSearchType(data.search_type || (smart ? "ai" : "text"));
      setIsSearchResults(true);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setDisplayedDocuments([]);
    } finally {
      setSearching(false);
    }
  };

  // Handle search submit (Enter key or button click)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim().length >= 2) {
      performSearch(searchTerm, isSmartSearch);
    }
  };

  // Toggle smart search mode
  const toggleSmartSearch = () => {
    const newValue = !isSmartSearch;
    setIsSmartSearch(newValue);
    // If there's a current search term, re-search with the new mode
    if (searchTerm.trim().length >= 2) {
      performSearch(searchTerm, newValue);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    setSearchType(null);
    setIsSearchResults(false);
    setSelectedIds(new Set());
    fetchDocuments(1);
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch("/api/documents/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: [id] }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      if (isSearchResults) {
        // Remove from displayed results without re-fetching
        setDisplayedDocuments((prev) => prev.filter((d) => d.id !== id));
      } else {
        fetchDocuments(currentPage);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} document(s)?`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/documents/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setSelectedIds(new Set());
      if (isSearchResults) {
        setDisplayedDocuments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      } else {
        fetchDocuments(currentPage);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    window.location.href = `/api/documents/${doc.id}/download`;
  };

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const link = document.createElement("a");
      link.href = `/api/documents/${id}/download`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("[data-no-navigate]")) return;
    router.push(`/documents/review/${id}`);
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex items-center justify-between border-b">
          <div className="flex gap-2">
            <Link href="/documents/import">
              <Button variant="ghost" className="rounded-none">Import</Button>
            </Link>
            <Link href="/documents/review">
              <Button variant="ghost" className="rounded-none">Review</Button>
            </Link>
            <Link href="/documents/archive">
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
                      ? "Find all ECS contracts from 2025..."
                      : "ECS AND contract"
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                {isSmartSearch ? "AI Search" : "AI Search"}
              </Button>
              <Button type="submit" disabled={searching || searchTerm.trim().length < 2}>
                {searching ? "Searching..." : "Search"}
              </Button>
            </form>
            <div className="mt-2 text-xs text-gray-500">
              {searchType ? (
                <>
                  {searchType === "ai" && "AI-powered semantic search"}
                  {searchType === "text" && "Boolean text search"}
                  {displayedDocuments.length > 0 && ` — ${displayedDocuments.length} results`}
                </>
              ) : (
                <>
                  Press Enter to search. Supports: &quot;quoted phrase&quot;, AND, NOT, -exclude. Toggle AI Search for natural language queries.
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions Bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2" data-no-navigate>
            <Checkbox
              checked={selectedIds.size === displayedDocuments.length && displayedDocuments.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-gray-500">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select All"}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button variant="outline" onClick={handleDownloadSelected}>
                  Download Selected ({selectedIds.size})
                </Button>
                <Button variant="destructive" onClick={handleDeleteSelected} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => isSearchResults ? performSearch(searchTerm, isSmartSearch) : fetchDocuments(currentPage)} disabled={loading || searching}>
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
                <Button variant="outline" onClick={() => fetchDocuments()}>Try Again</Button>
              </div>
            </CardContent>
          </Card>
        ) : loading || searching ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                {searching ? "Searching..." : "Loading documents..."}
              </p>
            </CardContent>
          </Card>
        ) : displayedDocuments.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                {isSearchResults ? "No documents match your search." : "No archived documents yet."}
              </p>
              {isSearchResults && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={clearSearch}>Clear Search</Button>
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
                    className={`${isSearchResults ? "" : "cursor-pointer hover:bg-gray-100"} select-none`}
                    onClick={() => handleSort("party")}
                  >
                    Party{getSortIndicator("party")}
                  </TableHead>
                  <TableHead
                    className={`w-32 ${isSearchResults ? "" : "cursor-pointer hover:bg-gray-100"} select-none`}
                    onClick={() => handleSort("type")}
                  >
                    Type{getSortIndicator("type")}
                  </TableHead>
                  <TableHead
                    className={`${isSearchResults ? "" : "cursor-pointer hover:bg-gray-100"} select-none`}
                    onClick={() => handleSort("notes")}
                  >
                    Notes{getSortIndicator("notes")}
                  </TableHead>
                  <TableHead
                    className={`w-28 ${isSearchResults ? "" : "cursor-pointer hover:bg-gray-100"} select-none`}
                    onClick={() => handleSort("date")}
                  >
                    Date{getSortIndicator("date")}
                  </TableHead>
                  <TableHead
                    className={`w-24 ${isSearchResults ? "" : "cursor-pointer hover:bg-gray-100"} select-none`}
                    onClick={() => handleSort("uploaded")}
                  >
                    Uploaded{getSortIndicator("uploaded")}
                  </TableHead>
                  <TableHead className="w-10" data-no-navigate></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedDocuments.map((doc) => (
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
                    <TableCell className="text-gray-600">{getDateDisplay(doc)}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {formatRelativeTime(doc.created_at)}
                    </TableCell>
                    <TableCell data-no-navigate>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">⋮</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/documents/review/${doc.id}`)}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(doc)}>
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteOne(doc.id)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Pagination Controls (only in browse mode, not search results) */}
            {!isSearchResults && totalPages > 1 && (
              <div className="flex items-center justify-between border-t p-4">
                <div className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, totalDocuments)} of {totalDocuments}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1 || loading}>
                    ← Previous
                  </Button>
                  <span className="text-sm text-gray-600 px-2">Page {currentPage} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages || loading}>
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
