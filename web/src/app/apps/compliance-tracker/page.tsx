"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";

/* ── Types ── */
interface ComplianceItem {
  id: number;
  agency: string;
  description: string;
  dueDate: string;
  done: boolean;
  year: number;
  notes: string;
  recurring: string;
  parentId: number | null;
  completedAt: string | null;
}

/* ── Constants ── */
const RECURRING_OPTIONS = ["none", "annual", "biennial", "quarterly"];
const RECURRING_LABELS: Record<string, string> = {
  none: "None",
  annual: "Annual",
  biennial: "Biennial (2 yr)",
  quarterly: "Quarterly",
};

/* Brand colors */
const brand = {
  navy: "#336699",
  medBlue: "#6699CC",
  teal: "#669999",
  gray: "#999999",
  charcoal: "#333333",
  amber: "#FF9933",
};

/* ── Date Helpers ── */
function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function shortDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function longDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function getDaysUntil(dateStr: string | null) {
  if (!dateStr) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + "T12:00:00").getTime() - today.getTime()) / 86400000);
}
function isOverdue(dateStr: string | null, done: boolean) {
  return !done && getDaysUntil(dateStr) < 0;
}
function getNextDueDate(dateStr: string, recurring: string) {
  const d = new Date(dateStr + "T12:00:00");
  if (recurring === "biennial") d.setFullYear(d.getFullYear() + 2);
  else if (recurring === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

/* ── Overlay ── */
function Overlay({ open, onClose, children, width }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl border border-gray-200 p-6" style={{ maxWidth: width || 520, width: "92%" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Item Form (Add / Edit) ── */
function ItemFormModal({ open, onClose, onSave, item, title }: {
  open: boolean; onClose: () => void; onSave: (form: { agency: string; description: string; dueDate: string; notes: string; recurring: string }) => void;
  item?: ComplianceItem | null; title: string;
}) {
  const [form, setForm] = useState({ agency: "", description: "", dueDate: "", notes: "", recurring: "annual" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      if (item) setForm({ agency: item.agency, description: item.description, dueDate: item.dueDate || "", notes: item.notes || "", recurring: item.recurring || "annual" });
      else setForm({ agency: "", description: "", dueDate: "", notes: "", recurring: "annual" });
    }
  }, [open, item]);
  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.agency && form.description && form.dueDate;
  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };
  return (
    <Overlay open={open} onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900 mb-5">{title}</h3>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Agency</label>
          <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent" value={form.agency} onChange={e => update("agency", e.target.value)} placeholder="e.g. State of Illinois" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
          <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent" value={form.description} onChange={e => update("description", e.target.value)} placeholder="e.g. Annual Report" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
            <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent" value={form.dueDate} onChange={e => update("dueDate", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recurring</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent bg-white" value={form.recurring} onChange={e => update("recurring", e.target.value)}>
              {RECURRING_OPTIONS.map(r => <option key={r} value={r}>{RECURRING_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
          <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent min-h-[60px] resize-y" value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Optional notes..." />
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button disabled={!valid || saving} onClick={handleSave} className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: valid ? brand.navy : "#ccc" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Complete Confirmation ── */
function CompleteModal({ open, onClose, item, onConfirm }: {
  open: boolean; onClose: () => void; item: ComplianceItem | null;
  onConfirm: (data: { note: string; scheduleNext: boolean; nextDate: string | null }) => void;
}) {
  const [note, setNote] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && item) {
      setNote("");
      const hasRecurring = !!(item.recurring && item.recurring !== "none");
      setScheduleNext(hasRecurring);
      setCustomDate(hasRecurring ? getNextDueDate(item.dueDate, item.recurring) : "");
    }
  }, [open, item]);
  if (!item) return null;
  const hasRecurring = item.recurring && item.recurring !== "none";
  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm({ note, scheduleNext, nextDate: scheduleNext ? customDate : null });
    setSaving(false);
  };
  return (
    <Overlay open={open} onClose={onClose} width={500}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center text-green-600 text-lg font-bold">{"\u2713"}</div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Mark as Complete</h3>
          <p className="text-xs text-gray-500 mt-0.5">{item.agency} &mdash; {item.description}</p>
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Completion Note <span className="font-normal normal-case tracking-normal">(optional)</span></label>
        <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent min-h-[56px] resize-y" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Filed online, confirmation #12345" />
      </div>
      <div className={`p-4 rounded-lg mb-5 transition-all border ${scheduleNext ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}>
        <div onClick={() => setScheduleNext(s => !s)} className="flex items-center gap-3 cursor-pointer">
          <div className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${scheduleNext ? "border-green-500 bg-green-500" : "border-gray-300 bg-white"}`}>
            {scheduleNext && <span className="text-white text-xs font-bold">{"\u2713"}</span>}
          </div>
          <div className="text-sm text-gray-800 font-medium">
            {hasRecurring
              ? `Schedule next ${RECURRING_LABELS[item.recurring]?.toLowerCase()} filing`
              : "Schedule a follow-up task?"}
          </div>
        </div>
        <div className="mt-3 ml-8">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Next due date</label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent"
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
          />
          {hasRecurring && customDate && (
            <div className="text-xs text-gray-400 mt-1">Auto-calculated from {item.recurring} recurrence. Edit if needed.</div>
          )}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button disabled={saving || (scheduleNext && !customDate)} onClick={handleConfirm} className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? "Saving..." : scheduleNext ? "Complete & Schedule Next" : "Complete"}
        </button>
      </div>
    </Overlay>
  );
}

/* ── Delete Confirmation ── */
function DeleteConfirm({ open, onClose, item, onConfirm }: {
  open: boolean; onClose: () => void; item: ComplianceItem | null;
  onConfirm: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!item) return null;
  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm(item.id);
    setDeleting(false);
    onClose();
  };
  return (
    <Overlay open={open} onClose={onClose} width={420}>
      <div className="text-center">
        <div className="text-4xl mb-3">{"\uD83D\uDDD1"}</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete this item?</h3>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          <strong className="text-gray-700">{item.agency}</strong> &mdash; {item.description}<br />
          <span className="text-xs text-gray-400">Due {longDate(item.dueDate)}</span>
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button disabled={deleting} onClick={handleDelete} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Row Actions ── */
function RowActions({ item, onComplete, onEdit, onDelete, onReopen }: {
  item: ComplianceItem;
  onComplete: (item: ComplianceItem) => void;
  onEdit: (item: ComplianceItem) => void;
  onDelete: (item: ComplianceItem) => void;
  onReopen: (id: number) => void;
}) {
  return (
    <div className="flex gap-1.5 justify-end">
      {!item.done ? (
        <button onClick={e => { e.stopPropagation(); onComplete(item); }} className="px-2.5 py-1 text-[11px] font-medium rounded bg-green-50 border border-green-200 text-green-700 hover:bg-green-100">
          Complete
        </button>
      ) : (
        <button onClick={e => { e.stopPropagation(); onReopen(item.id); }} className="px-2.5 py-1 text-[11px] font-medium rounded border hover:opacity-80" style={{ background: "#f0f5fa", borderColor: "#c2d6eb", color: brand.medBlue }}>
          Reopen
        </button>
      )}
      <button onClick={e => { e.stopPropagation(); onEdit(item); }} className="px-2.5 py-1 text-[11px] font-medium rounded bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200">
        Edit
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete(item); }} className="px-2.5 py-1 text-[11px] font-medium rounded bg-red-50 border border-red-100 text-red-400 hover:bg-red-100 hover:text-red-600">
        Delete
      </button>
    </div>
  );
}

/* ── Main Page ── */
export default function ComplianceTrackerPage() {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [filter, setFilter] = useState("open");
  const [sortField, setSortField] = useState("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ComplianceItem | null>(null);
  const [completeItem, setCompleteItem] = useState<ComplianceItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
    } catch (err) {
      console.error("Error fetching compliance items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const years = useMemo(() => [...new Set(items.map(i => i.year))].sort(), [items]);

  useEffect(() => {
    if (years.length > 0 && !years.includes(selectedYear)) {
      const currentYear = new Date().getFullYear();
      setSelectedYear(years.includes(currentYear) ? currentYear : years[years.length - 1]);
    }
  }, [years, selectedYear]);

  const filteredItems = useMemo(() => {
    let list = items.filter(i => i.year === selectedYear);
    if (filter === "open") list = list.filter(i => !i.done);
    else if (filter === "due60") list = list.filter(i => !i.done && getDaysUntil(i.dueDate) <= 60 && getDaysUntil(i.dueDate) >= 0);
    else if (filter === "due30") list = list.filter(i => !i.done && getDaysUntil(i.dueDate) <= 30 && getDaysUntil(i.dueDate) >= 0);
    else if (filter === "complete") list = list.filter(i => i.done);
    else if (filter === "overdue") list = list.filter(i => isOverdue(i.dueDate, i.done));
    list.sort((a, b) => {
      if (filter === "all" && a.done !== b.done) return a.done ? 1 : -1;
      let c = 0;
      if (sortField === "dueDate") c = (a.dueDate || "").localeCompare(b.dueDate || "");
      else if (sortField === "agency") c = a.agency.localeCompare(b.agency);
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [items, selectedYear, filter, sortField, sortDir]);

  const stats = useMemo(() => {
    const yr = items.filter(i => i.year === selectedYear);
    return {
      total: yr.length,
      complete: yr.filter(i => i.done).length,
      overdue: yr.filter(i => isOverdue(i.dueDate, i.done)).length,
      due30: yr.filter(i => !i.done && getDaysUntil(i.dueDate) <= 30 && getDaysUntil(i.dueDate) >= 0).length,
    };
  }, [items, selectedYear]);

  const handleAdd = useCallback(async (form: { agency: string; description: string; dueDate: string; notes: string; recurring: string }) => {
    const year = parseInt(form.dueDate.split("-")[0]);
    await fetch("/api/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, year }),
    });
    await fetchItems();
  }, [fetchItems]);

  const handleEdit = useCallback(async (form: { agency: string; description: string; dueDate: string; notes: string; recurring: string }) => {
    if (!editItem) return;
    await fetch(`/api/compliance/${editItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await fetchItems();
  }, [editItem, fetchItems]);

  const handleCompleteConfirm = useCallback(async ({ note, scheduleNext, nextDate }: { note: string; scheduleNext: boolean; nextDate: string | null }) => {
    if (!completeItem) return;
    await fetch(`/api/compliance/${completeItem.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, scheduleNext, nextDueDate: nextDate }),
    });
    setCompleteItem(null);
    await fetchItems();
  }, [completeItem, fetchItems]);

  const handleReopen = useCallback(async (id: number) => {
    await fetch(`/api/compliance/${id}/reopen`, { method: "POST" });
    await fetchItems();
  }, [fetchItems]);

  const handleDelete = useCallback(async (id: number) => {
    await fetch(`/api/compliance/${id}`, { method: "DELETE" });
    await fetchItems();
  }, [fetchItems]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const Arrow = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="ml-1 text-[9px] opacity-30">{"\u21C5"}</span>;
    return <span className="ml-1 text-[9px]" style={{ color: brand.medBlue }}>{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  const filters = [
    { key: "all", label: "All Items" },
    { key: "open", label: "Open Items" },
    { key: "due60", label: "Due < 60 Days" },
    { key: "due30", label: "Due < 30 Days" },
    { key: "overdue", label: "Overdue" },
    { key: "complete", label: "Complete" },
  ];

  const pct = stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1200px]">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl text-white" style={{ background: brand.navy }}>
              {"\uD83C\uDFDB"}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Compliance Tracker</h1>
              <p className="text-sm text-gray-500">Filings, licenses & annual reports</p>
            </div>
          </div>
          <button onClick={() => setAddOpen(true)} className="px-5 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90" style={{ background: brand.navy }}>
            + New Item
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Year Tabs */}
            <div className="flex gap-0.5 border-b border-gray-200">
              {years.map(y => {
                const active = y === selectedYear;
                const openCnt = items.filter(i => i.year === y && !i.done).length;
                return (
                  <button key={y} onClick={() => setSelectedYear(y)} className={`px-5 py-2.5 text-sm font-medium border-b-2 rounded-t-lg transition-colors ${active ? "border-[#336699] text-gray-900 bg-white" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                    {y}
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-blue-50 text-[#336699]" : "bg-gray-100 text-gray-400"}`}>
                      {openCnt} open
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Total", value: stats.total, color: brand.charcoal, borderColor: "" },
                { label: "Complete", value: stats.complete, color: brand.medBlue, borderColor: "" },
                { label: "Overdue", value: stats.overdue, color: stats.overdue > 0 ? "#ef4444" : "#aaa", borderColor: stats.overdue > 0 ? "border-red-200" : "" },
                { label: "Due \u2264 30d", value: stats.due30, color: stats.due30 > 0 ? brand.amber : "#aaa", borderColor: stats.due30 > 0 ? "border-amber-200" : "" },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-xl p-3.5 border ${s.borderColor || "border-gray-200"}`}>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
              <div className="bg-white rounded-xl p-3.5 border border-gray-200">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Progress</div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-bold" style={{ color: brand.teal }}>{pct}%</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: pct + "%", background: `linear-gradient(90deg, ${brand.teal}, ${brand.navy})` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 flex-wrap">
              {filters.map(f => {
                const active = filter === f.key;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? "bg-blue-50 text-[#336699] border border-blue-200" : "text-gray-400 hover:text-gray-600 border border-transparent"}`}>
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid gap-2" style={{ gridTemplateColumns: "1.2fr 1.8fr 0.9fr 0.9fr", padding: "10px 16px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                <button onClick={() => toggleSort("agency")} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider p-0 bg-transparent border-none cursor-pointer">
                  Agency<Arrow field="agency" />
                </button>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</span>
                <button onClick={() => toggleSort("dueDate")} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider p-0 bg-transparent border-none cursor-pointer">
                  Due Date<Arrow field="dueDate" />
                </button>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</span>
              </div>

              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <div className="text-4xl mb-2">{filter === "overdue" ? "\uD83C\uDF89" : filter === "complete" ? "\uD83D\uDCCB" : "\u2713"}</div>
                  <div className="text-sm">{filter === "overdue" ? "Nothing overdue \u2014 nice work!" : "No items match this filter"}</div>
                </div>
              ) : filteredItems.map((item, idx) => {
                const over = isOverdue(item.dueDate, item.done);
                const days = getDaysUntil(item.dueDate);
                return (
                  <div key={item.id} className={`grid gap-2 items-center transition-colors ${over ? "bg-red-50 hover:bg-red-100/70" : item.done ? "bg-gray-50/50 hover:bg-gray-100/50" : "hover:bg-gray-50"}`}
                    style={{
                      gridTemplateColumns: "1.2fr 1.8fr 0.9fr 0.9fr",
                      padding: "10px 16px",
                      borderBottom: idx < filteredItems.length - 1 ? "1px solid #f3f4f6" : "none",
                      opacity: item.done ? 0.55 : 1,
                    }}
                    onMouseEnter={e => { if (item.done) e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={e => { if (item.done) e.currentTarget.style.opacity = "0.55"; }}
                  >
                    <div className={`font-medium text-[13px] ${item.done ? "line-through text-gray-400 decoration-gray-300" : "text-gray-900"}`}>
                      {item.agency}
                    </div>
                    <div className={`text-[13px] ${item.done ? "text-gray-400" : "text-gray-500"}`}>
                      {item.description}
                      {item.recurring && item.recurring !== "none" && !item.done && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ color: brand.teal, background: "#66999912" }}>
                          {"\uD83D\uDD01"} {item.recurring}
                        </span>
                      )}
                      {item.notes && !item.done && <span className="ml-1.5 text-[10px] text-gray-300 cursor-help" title={item.notes}>{"\uD83D\uDCDD"}</span>}
                    </div>
                    <div>
                      <div className={`text-[13px] ${over ? "text-red-600 font-semibold" : item.done ? "text-gray-400" : "text-gray-700"}`}>
                        {formatDate(item.dueDate)}
                      </div>
                      {!item.done && item.dueDate && (
                        <div className="text-[10px] mt-0.5" style={{ color: over ? "#ef4444" : days <= 30 ? brand.amber : "#aaa" }}>
                          {over ? Math.abs(days) + "d overdue" : days === 0 ? "Due today" : days + "d left"}
                        </div>
                      )}
                      {item.done && item.completedAt && (
                        <div className="text-[10px] mt-0.5" style={{ color: brand.medBlue }}>
                          Done {shortDate(item.completedAt.split("T")[0])}
                        </div>
                      )}
                    </div>
                    <RowActions item={item} onComplete={setCompleteItem} onEdit={setEditItem} onDelete={setDeleteTarget} onReopen={handleReopen} />
                  </div>
                );
              })}
            </div>

            <div className="text-right text-xs text-gray-400">
              {filteredItems.length} of {items.filter(i => i.year === selectedYear).length} items
            </div>
          </>
        )}

        <ItemFormModal open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAdd} title="Add Compliance Item" />
        <ItemFormModal open={!!editItem} onClose={() => setEditItem(null)} onSave={handleEdit} item={editItem} title="Edit Item" />
        <CompleteModal open={!!completeItem} onClose={() => setCompleteItem(null)} item={completeItem} onConfirm={handleCompleteConfirm} />
        <DeleteConfirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} item={deleteTarget} onConfirm={handleDelete} />
      </div>
    </AppLayout>
  );
}
