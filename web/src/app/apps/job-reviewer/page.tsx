"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";

// ─────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────
const KEY_CRITERIA = "job-reviewer:criteria";
const KEY_JD = "job-reviewer:jd-text";

// ─────────────────────────────────────────────
// Default criteria
// ─────────────────────────────────────────────
const DEFAULT_CRITERIA = `VOYAGE ADVISORY — CANDIDATE BASELINE REVIEW CRITERIA

ELIGIBILITY & LOGISTICS
- Work authorization: Confirm candidate is authorized to work in the US (and Canada if relevant)
- Location fit: Is candidate located in or willing to relocate/travel to client regions?
- Compensation alignment: Document the candidate's stated salary requirement. If the job description includes a comp range, flag whether the candidate is aligned, over, or under that range.

EXPERIENCE RED FLAGS
- Unexplained employment gaps longer than 3 months
- Excessive job hopping (3+ roles in under 4 years without clear progression)
- Vague or inflated job titles with no substantive description
- No track record of delivering measurable results (must have outcomes, not just activities)
- Only internal/corporate experience with no exposure to client-facing or project-based work

EXPERIENCE GREEN FLAGS
- Prior management consulting or professional services experience
- Utility, public sector, financial services, or manufacturing/supply chain industry exposure
- Contact center, field operations, or process improvement background
- Experience with data tools (Excel/Power BI/Tableau/SQL/Python)
- Clear evidence of leading workstreams, managing stakeholders, or building deliverables independently
- Advanced degree or relevant certifications (PMP, Lean/Six Sigma, industry-specific)

COMMUNICATION & FIT SIGNALS
- Cover letter or application responses demonstrate clear, professional writing
- Answers are specific and results-oriented, not generic
- Evidence of coachability or continuous learning
- Cultural fit indicators: collaborative, accountable, growth-oriented

VOYAGE-SPECIFIC CONSIDERATIONS
- Familiarity with or interest in technology-enabled consulting
- Comfort with ambiguity and fast-paced project environments
- Willingness to travel (up to ~25–50% depending on role)
- References available or strong LinkedIn presence`;

// ─────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior talent reviewer at Voyage Advisory, a management consulting firm.
You evaluate candidates with high standards for consulting aptitude, relevant industry experience, and cultural fit.
You write clear, direct, professional assessments — specific and evidence-based, never generic.
Return valid JSON only — no markdown fences, no preamble, no extra text.`;

const JSON_INSTRUCTIONS = `Return a single JSON object with EXACTLY this structure (no extra keys, no markdown):
{
  "snapshot": {
    "name": "Full name or 'Unknown'",
    "email": "email or null",
    "phone": "phone or null",
    "linkedin": "LinkedIn URL or handle or null",
    "yearsExperience": "e.g. '8 years' or null",
    "highestDegree": "e.g. 'MBA, University of Michigan' or null",
    "salaryRequirement": "candidate's stated requirement or expectation, e.g. '$95,000' or '$90K-$110K', or null if not stated",
    "salaryComparison": "ONLY populate if the job description includes a comp range - compare candidate's requirement to the JD range, e.g. 'Aligned - wants $95K, JD range $90K-$110K' or 'Over range - wants $130K, JD cap $120K'. Set to null if no JD comp range was provided.",
    "salaryFlag": "green if aligned or no comp range in JD to compare against, yellow if slightly over/under, red if significantly misaligned, or null if candidate stated no requirement",
    "avgTenure": "average tenure per role, e.g. '2.1 years' or null",
    "longestGap": "longest gap between jobs, e.g. '7 months (2021–2022)' or null",
    "jobHoppingFlag": true or false,
    "gapFlag": true or false
  },
  "overallFit": "Strong Fit" | "Moderate Fit" | "Weak Fit",
  "recommendation": "Advance" | "Hold" | "Pass",
  "writeUp": "A 3–5 sentence narrative assessment of the candidate. Be specific — reference their actual background, companies, roles, and numbers. Open with a one-sentence verdict. Then cover experience quality, relevant strengths, and key concerns. Close with a clear recommendation rationale. Use **bold** to highlight 2–3 key phrases.",
  "strengths": ["specific strength with evidence", "..."],
  "watchItems": ["specific watch item with context", "..."],
  "gaps": ["specific gap or red flag with detail", "..."],
  "interviewFocus": ["targeted question or probe area", "..."],
  "criteriaNote": "one sentence on which criteria set was applied"
}`;

// ─────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────
function readAsBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsText(file);
  });
}
const isPdf = (f: File) => f?.type === "application/pdf";
const isText = (f: File) => f && !isPdf(f);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Snapshot {
  name: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  yearsExperience: string | null;
  highestDegree: string | null;
  salaryRequirement: string | null;
  salaryComparison: string | null;
  salaryFlag: string | null;
  avgTenure: string | null;
  longestGap: string | null;
  jobHoppingFlag: boolean;
  gapFlag: boolean;
}

interface ReviewResult {
  snapshot: Snapshot;
  overallFit: string;
  recommendation: string;
  writeUp: string;
  strengths: string[];
  watchItems: string[];
  gaps: string[];
  interviewFocus: string[];
  criteriaNote: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = { type: string; [key: string]: any };

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-600">
      ✓ Saved
    </span>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const kb = (file.size / 1024).toFixed(0);
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[13px] text-slate-700">
      <span>{isPdf(file) ? "📄" : file.name?.endsWith(".md") ? "📋" : "📝"}</span>
      <span className="max-w-[200px] truncate">{file.name}</span>
      <span className="text-[11px] text-slate-400">({kb} KB)</span>
      <button onClick={onRemove} className="shrink-0 px-0.5 text-[15px] text-slate-400 hover:text-slate-600">
        ×
      </button>
    </div>
  );
}

function InputSection({
  accent,
  partLabel,
  title,
  badge,
  description,
  file,
  onFileDrop,
  onFileSelect,
  onFileClear,
  fileRef,
  fileAccept,
  dropHint,
  pasteValue,
  onPasteChange,
  pastePlaceholder,
  pasteRows,
  saved,
}: {
  accent: string;
  partLabel: string;
  title: string;
  badge?: string;
  description?: string;
  file: File | null;
  onFileDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileClear: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileAccept: string;
  dropHint: string;
  pasteValue: string;
  onPasteChange: (v: string) => void;
  pastePlaceholder: string;
  pasteRows?: number;
  saved: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" style={{ borderLeftWidth: 4, borderLeftColor: accent }}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
          {partLabel} — {title}
        </span>
        {badge && <span className="text-[11px] text-slate-400">{badge}</span>}
        <SavedBadge show={saved} />
      </div>
      {description && <p className="mb-2.5 text-[13px] leading-relaxed text-slate-500">{description}</p>}
      {file && (
        <div className="mb-2.5">
          <FileChip file={file} onRemove={onFileClear} />
        </div>
      )}
      {!file && (
        <div
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFileDrop(e); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
          className="mb-2.5 cursor-pointer rounded-lg border-2 border-dashed p-3 text-center transition-all"
          style={{
            borderColor: dragging ? accent : "#c0cfe0",
            background: dragging ? `${accent}0d` : "#fafcff",
          }}
        >
          <div className="text-[13px] text-slate-500">
            📎 {dropHint} or <span className="underline" style={{ color: accent }}>browse</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">{fileAccept}</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept={fileAccept} className="hidden" onChange={onFileSelect} />
      <div className="my-2 flex items-center gap-2.5">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-[11px] text-slate-400">{file ? "extracted text (editable)" : "or paste below"}</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>
      <textarea
        value={pasteValue}
        onChange={(e) => onPasteChange(e.target.value)}
        placeholder={pastePlaceholder}
        rows={pasteRows || 5}
        className="w-full resize-y rounded-md border p-2.5 text-[13px] leading-relaxed text-slate-700 outline-none"
        style={{
          borderColor: file ? `${accent}66` : "#cdd9e5",
          background: file ? `${accent}05` : "#fff",
        }}
      />
    </div>
  );
}

function ScoreBadge({ score }: { score: string }) {
  const cls =
    score === "Strong Fit"
      ? "border-green-300 bg-green-100 text-green-800"
      : score === "Moderate Fit"
        ? "border-yellow-300 bg-yellow-100 text-yellow-800"
        : "border-red-300 bg-red-100 text-red-800";
  return <span className={`inline-block rounded-md border px-3.5 py-1 text-[15px] font-bold ${cls}`}>{score}</span>;
}

function StatCard({ label, value, sub, flag }: { label: string; value?: string | null; sub?: string | null; flag?: string | null }) {
  const bgCls =
    flag === "green" ? "border-green-200 bg-green-50" :
    flag === "yellow" ? "border-yellow-200 bg-yellow-50" :
    flag === "red" ? "border-red-200 bg-red-50" :
    "border-slate-200 bg-slate-50";
  const valCls =
    flag === "green" ? "text-green-800" :
    flag === "yellow" ? "text-yellow-800" :
    flag === "red" ? "text-red-800" :
    "text-slate-800";
  return (
    <div className={`min-w-[120px] flex-1 rounded-lg border p-2.5 ${bgCls}`}>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[15px] font-bold leading-tight ${valCls}`}>
        {value || <span className="font-normal italic text-slate-300">Not found</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function BulletSection({ title, colorCls, bgCls, items }: { title: string; colorCls: string; bgCls: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mb-4">
      <div className={`mb-2 text-[13px] font-bold tracking-wide ${colorCls}`}>{title}</div>
      <div className={`rounded-md border p-3 ${bgCls}`}>
        <ul className="m-0 list-disc pl-5">
          {items.map((item, i) => (
            <li key={i} className="mb-1 text-[13px] leading-relaxed text-slate-700">{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WriteUp({ text }: { text?: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="m-0 text-[13px] leading-[1.7] text-slate-700">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p
      )}
    </p>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function JobReviewerPage() {
  // Part 1 — Criteria
  const [criteriaText, setCriteriaText] = useState(DEFAULT_CRITERIA);
  const [criteriaFile, setCriteriaFile] = useState<File | null>(null);
  const [criteriaSaved, setCriteriaSaved] = useState(false);
  const criteriaFileRef = useRef<HTMLInputElement>(null);

  // Part 2 — Job Description
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdSaved, setJdSaved] = useState(false);
  const jdFileRef = useRef<HTMLInputElement>(null);

  // Part 3 — Candidate files + paste
  const [candidateFiles, setCandidateFiles] = useState<File[]>([]);
  const [candidatePasteText, setCandidatePasteText] = useState("");
  const [candDragging, setCandDragging] = useState(false);
  const candFileRef = useRef<HTMLInputElement>(null);

  // UI
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_CRITERIA);
      if (saved) setCriteriaText(saved);
    } catch {}
    try {
      const saved = localStorage.getItem(KEY_JD);
      if (saved) setJdText(saved);
    } catch {}
    setStorageReady(true);
  }, []);

  // Auto-save criteria
  useEffect(() => {
    if (!storageReady) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY_CRITERIA, criteriaText);
        setCriteriaSaved(true);
        setTimeout(() => setCriteriaSaved(false), 2000);
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [criteriaText, storageReady]);

  // Auto-save JD
  useEffect(() => {
    if (!storageReady) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY_JD, jdText);
        if (jdText.trim()) {
          setJdSaved(true);
          setTimeout(() => setJdSaved(false), 2000);
        }
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [jdText, storageReady]);

  // Criteria file handlers
  const handleCriteriaFileDrop = useCallback(async (e: React.DragEvent) => {
    const file = [...e.dataTransfer.files][0];
    if (!file) return;
    setCriteriaFile(file);
    if (isText(file)) setCriteriaText(await readAsText(file));
  }, []);
  const handleCriteriaFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCriteriaFile(file);
    if (isText(file)) setCriteriaText(await readAsText(file));
    e.target.value = "";
  };

  // JD file handlers
  const handleJdFileDrop = useCallback(async (e: React.DragEvent) => {
    const file = [...e.dataTransfer.files][0];
    if (!file) return;
    setJdFile(file);
    if (isText(file)) setJdText(await readAsText(file));
  }, []);
  const handleJdFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdFile(file);
    if (isText(file)) setJdText(await readAsText(file));
    e.target.value = "";
  };

  // Candidate file handlers
  const addCandidateFiles = useCallback((incoming: FileList) => {
    const ok = [...incoming].filter(
      (f) => isPdf(f) || f.type === "text/plain" || f.name.endsWith(".md") || f.name.endsWith(".txt")
    );
    setCandidateFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name));
      return [...prev, ...ok.filter((f) => !seen.has(f.name))];
    });
  }, []);
  const removeCandidate = (name: string) => setCandidateFiles((prev) => prev.filter((f) => f.name !== name));

  // Build messages for Claude
  async function buildMessages() {
    const blocks: ContentBlock[] = [];
    const hasJD = !!(jdFile || jdText.trim());

    const systemNote = hasJD
      ? "A job description has been provided. Evaluate the candidate against BOTH the Voyage baseline criteria AND the specific role requirements."
      : "No job description provided. Evaluate against Voyage baseline criteria only.";

    // Criteria
    if (criteriaFile && isPdf(criteriaFile)) {
      blocks.push({ type: "text", text: `${systemNote}\n\nThe following PDF contains the VOYAGE BASELINE CRITERIA:` });
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await readAsBase64(criteriaFile) } });
    } else {
      blocks.push({ type: "text", text: `${systemNote}\n\n---\nVOYAGE BASELINE CRITERIA:\n${criteriaText}` });
    }

    // JD
    if (jdFile && isPdf(jdFile)) {
      blocks.push({ type: "text", text: "The following PDF is the JOB DESCRIPTION:" });
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await readAsBase64(jdFile) } });
    } else if (jdText.trim()) {
      blocks.push({ type: "text", text: `---\nJOB DESCRIPTION:\n${jdText.trim()}` });
    }

    // Candidate materials (files)
    for (const file of candidateFiles) {
      if (isPdf(file)) {
        blocks.push({ type: "text", text: `The following PDF is candidate material: ${file.name}` });
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await readAsBase64(file) } });
      } else {
        blocks.push({ type: "text", text: `---\nCANDIDATE FILE (${file.name}):\n${await readAsText(file)}` });
      }
    }

    // Candidate materials (pasted text)
    if (candidatePasteText.trim()) {
      blocks.push({ type: "text", text: `---\nCANDIDATE MATERIAL (pasted):\n${candidatePasteText.trim()}` });
    }

    blocks.push({ type: "text", text: JSON_INSTRUCTIONS });
    return [{ role: "user", content: blocks }];
  }

  // Submit review
  async function handleReview() {
    if (!candidateFiles.length && !candidatePasteText.trim()) {
      setError("Please upload at least one candidate file or paste candidate information.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const messages = await buildMessages();
      const resp = await fetch("/api/job-reviewer/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: SYSTEM_PROMPT, messages }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Review failed");
      setResult(data);
    } catch (err: unknown) {
      setError("Review failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  // Snapshot flag helpers
  function tenureFlag(avg: string | null | undefined) {
    if (!avg) return null;
    const n = parseFloat(avg);
    if (isNaN(n)) return null;
    return n < 1 ? "red" : n < 2 ? "yellow" : "green";
  }

  const canSubmit = (candidateFiles.length > 0 || candidatePasteText.trim().length > 0) && !loading;
  const snap = result?.snapshot;

  const recColor =
    result?.recommendation === "Advance" ? "text-green-800" :
    result?.recommendation === "Pass" ? "text-red-800" : "text-yellow-800";
  const recBg =
    result?.recommendation === "Advance" ? "border-green-200 bg-green-50" :
    result?.recommendation === "Pass" ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50";

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-[#336699]">Job Reviewer</h1>
          <p className="text-sm text-slate-500">Review candidates against Voyage&apos;s baseline criteria and an optional job description.</p>
        </div>
        {/* Part 1 — Criteria */}
        <InputSection
          accent="#669999"
          partLabel="Part 1"
          title="Baseline Criteria"
          badge="always applied · shared across Voyage"
          description="Standard criteria applied to every candidate. Edit directly or load from a file. Changes save automatically."
          file={criteriaFile}
          onFileDrop={handleCriteriaFileDrop}
          onFileSelect={handleCriteriaFileSelect}
          onFileClear={() => setCriteriaFile(null)}
          fileRef={criteriaFileRef}
          fileAccept=".pdf,.txt,.md"
          dropHint="Drop criteria file"
          pasteValue={criteriaText}
          onPasteChange={setCriteriaText}
          pastePlaceholder="Paste evaluation criteria here…"
          pasteRows={10}
          saved={criteriaSaved}
        />

        {/* Part 2 — Job Description */}
        <InputSection
          accent="#336699"
          partLabel="Part 2"
          title="Job Description"
          badge="optional · remembered for you"
          description="Attach or paste the job description for this role. If omitted, the review uses baseline criteria only. Your last JD is remembered between sessions."
          file={jdFile}
          onFileDrop={handleJdFileDrop}
          onFileSelect={handleJdFileSelect}
          onFileClear={() => setJdFile(null)}
          fileRef={jdFileRef}
          fileAccept=".pdf,.txt,.md"
          dropHint="Drop JD file"
          pasteValue={jdText}
          onPasteChange={setJdText}
          pastePlaceholder="Paste the job description here…"
          pasteRows={6}
          saved={jdSaved}
        />

        {/* Part 3 — Candidate Materials */}
        <div className="rounded-lg border border-slate-200 bg-white p-4" style={{ borderLeftWidth: 4, borderLeftColor: "#CC9933" }}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#CC9933" }}>
              Part 3 — Candidate Materials
            </span>
            <span className="text-[11px] text-red-500">required</span>
          </div>
          <p className="mb-2.5 text-[13px] leading-relaxed text-slate-500">
            Upload resume, JazzHR application export, cover letter, or any other candidate documents. Multiple files supported.
          </p>
          <div
            onDrop={(e) => { e.preventDefault(); setCandDragging(false); addCandidateFiles(e.dataTransfer.files); }}
            onDragOver={(e) => { e.preventDefault(); setCandDragging(true); }}
            onDragLeave={() => setCandDragging(false)}
            onClick={() => candFileRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-all"
            style={{
              borderColor: candDragging ? "#CC9933" : "#c0cfe0",
              background: candDragging ? "#fffbf0" : "#fafcff",
              marginBottom: candidateFiles.length ? 12 : 0,
            }}
          >
            <div className="mb-1.5 text-2xl">📂</div>
            <div className="text-[13px] text-slate-500">
              Drop files here or <span className="text-[#336699] underline">browse</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">PDF, TXT, MD — multiple files supported</div>
          </div>
          <input ref={candFileRef} type="file" multiple accept=".pdf,.txt,.md" className="hidden" onChange={(e) => { if (e.target.files) addCandidateFiles(e.target.files); }} />
          {candidateFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {candidateFiles.map((f) => (
                <FileChip key={f.name} file={f} onRemove={() => removeCandidate(f.name)} />
              ))}
            </div>
          )}
          <div className="my-2 flex items-center gap-2.5">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-[11px] text-slate-400">or paste below</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
          <textarea
            value={candidatePasteText}
            onChange={(e) => setCandidatePasteText(e.target.value)}
            placeholder="Paste resume text, JazzHR application responses, or other candidate info here…"
            rows={6}
            className="w-full resize-y rounded-md border border-slate-300 bg-white p-2.5 text-[13px] leading-relaxed text-slate-700 outline-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleReview}
          disabled={!canSubmit}
          className="self-start rounded-lg px-7 py-3.5 text-[15px] font-bold tracking-wide text-white transition-colors"
          style={{ background: canSubmit ? "#0D3B66" : "#a0aec0", cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {loading ? "Reviewing candidate…" : "Run Candidate Review →"}
        </button>

        {/* Results */}
        {result && snap && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Top bar */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-400">Candidate Review</div>
                <div className="text-[22px] font-bold text-[#336699]">{snap.name}</div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  {snap.email && <span>✉ {snap.email}</span>}
                  {snap.phone && <span>📞 {snap.phone}</span>}
                  {snap.linkedin && <span>🔗 {snap.linkedin}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <ScoreBadge score={result.overallFit} />
                <div className={`rounded-md border px-3.5 py-1 text-[13px] font-bold ${recBg} ${recColor}`}>
                  → {result.recommendation}
                </div>
              </div>
            </div>

            {/* Snapshot stats */}
            <div className="mb-5">
              <div className="mb-2.5 text-[10px] uppercase tracking-widest text-slate-400">Candidate Snapshot</div>
              <div className="flex flex-wrap gap-2">
                <StatCard label="Years of Experience" value={snap.yearsExperience} />
                <StatCard label="Highest Degree" value={snap.highestDegree} />
                <StatCard
                  label="Compensation"
                  value={snap.salaryRequirement || "Not stated"}
                  sub={snap.salaryComparison}
                  flag={snap.salaryFlag}
                />
                <StatCard
                  label="Avg Tenure / Role"
                  value={snap.avgTenure}
                  flag={tenureFlag(snap.avgTenure)}
                  sub={snap.jobHoppingFlag ? "⚠ job hopping pattern" : null}
                />
                <StatCard
                  label="Longest Gap"
                  value={snap.longestGap}
                  flag={snap.gapFlag ? "red" : "green"}
                />
              </div>
            </div>

            {/* Write-up */}
            <div className="mb-5">
              <div className="mb-2.5 text-[10px] uppercase tracking-widest text-slate-400">Assessment</div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5" style={{ borderLeftWidth: 3, borderLeftColor: "#336699" }}>
                <WriteUp text={result.writeUp} />
              </div>
              {result.criteriaNote && (
                <div className="mt-1.5 text-[11px] italic text-slate-400">{result.criteriaNote}</div>
              )}
            </div>

            {/* Bullet sections */}
            <BulletSection title="✅ Strengths" colorCls="text-green-800" bgCls="border-green-200 bg-green-50" items={result.strengths} />
            <BulletSection title="⚠️ Watch Items" colorCls="text-yellow-800" bgCls="border-yellow-200 bg-yellow-50" items={result.watchItems} />
            <BulletSection title="❌ Gaps / Red Flags" colorCls="text-red-800" bgCls="border-red-200 bg-red-50" items={result.gaps} />
            <BulletSection title="💬 Suggested Interview Focus" colorCls="text-[#336699]" bgCls="border-slate-200 bg-blue-50" items={result.interviewFocus} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
