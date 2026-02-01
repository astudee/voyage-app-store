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
}

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

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents-v2?status=archived&limit=500");
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: DocumentsResponse = await res.json();
      setDocuments(data.documents);
      setDisplayedDocuments(data.documents);
      setSearchType(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Local text filtering (instant)
  const performLocalFilter = useCallback(
    (term: string) => {
      if (!term) {
        setDisplayedDocuments(documents);
        setSearchType(null);
        return;
      }

      const lowerTerm = term.toLowerCase();
      const filtered = documents.filter((doc) => {
        return (
          doc.party?.toLowerCase().includes(lowerTerm) ||
          doc.sub_party?.toLowerCase().includes(lowerTerm) ||
          doc.original_filename.toLowerCase().includes(lowerTerm) ||
          doc.contract_type?.toLowerCase().includes(lowerTerm) ||
          doc.document_type?.toLowerCase().includes(lowerTerm) ||
          doc.ai_summary?.toLowerCase().includes(lowerTerm) ||
          doc.notes?.toLowerCase().includes(lowerTerm)
        );
      });
      setDisplayedDocuments(filtered);
      setSearchType("local");
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

  const handleDownload = async (doc: Document) => {
    try {
      const res = await fetch(`/api/documents-v2/${doc.id}/view-url`);
      if (!res.ok) throw new Error("Failed to get download URL");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
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
                Archive ({documents.length})
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
                      ? "Ask a question about your documents... (e.g., 'NDAs with Acme Corp', 'invoices over $5000')"
                      : "Filter by party, filename, type..."
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
            {searchType && (
              <div className="mt-2 text-xs text-gray-500">
                {searchType === "ai" && "AI-powered semantic search"}
                {searchType === "text" && "Text-based search (AI unavailable)"}
                {searchType === "local" && "Instant filter"}
                {displayedDocuments.length > 0 && ` • ${displayedDocuments.length} results`}
              </div>
            )}
          </CardContent>
        </Card>

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
                  <TableHead
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("party")}
                  >
                    Party{getSortIndicator("party")}
                  </TableHead>
                  <TableHead
                    className="w-40 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("type")}
                  >
                    Type{getSortIndicator("type")}
                  </TableHead>
                  <TableHead
                    className="w-32 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("date")}
                  >
                    Date{getSortIndicator("date")}
                  </TableHead>
                  <TableHead
                    className="w-64 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("notes")}
                  >
                    Notes{getSortIndicator("notes")}
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDocuments.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/documents-v2/review/${doc.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">{getPartyDisplay(doc)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadgeColor(doc)}>
                        {getTypeDisplay(doc)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{getDateDisplay(doc)}</TableCell>
                    <TableCell
                      className="text-gray-500 text-sm truncate max-w-[16rem]"
                      title={doc.notes || ""}
                    >
                      {doc.notes || "-"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
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
                            View
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
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
