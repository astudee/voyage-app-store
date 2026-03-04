'use client'

import { useState, useMemo, useCallback } from 'react'
import { AppLayout } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, ExternalLink, FileText, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: string
  title: string
  department: string
  city: string
  state: string
  status: string
  original_open_date: string
  applicant_count: number | null
}

interface Education {
  degree: string
  school: string
}

interface Applicant {
  id: string
  name: string
  email: string
  location: string
  applyDate: string
  status: string
  statusBucket: 'Active' | 'New' | 'Not Hired'
  resumeUrl: string
  linkedinUrl: string
  salaryRequirement: string
  usEligible: string
  education: Education[]
  rating: string
  detailLoaded: boolean
}

type JobStatus = 'Open' | 'On Hold' | 'Closed' | 'Cancelled'
type SortField = 'name' | 'location' | 'applyDate' | 'salaryRequirement' | 'usEligible'
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUCKET_ORDER: Record<string, number> = { Active: 0, New: 1, 'Not Hired': 2 }

const bucketColor: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  New: 'bg-blue-100 text-blue-800 border-blue-200',
  'Not Hired': 'bg-slate-100 text-slate-500 border-slate-200',
}

function formatDate(d: string) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return d
  }
}

function formatEducation(edu: Education[]) {
  if (!edu || edu.length === 0) return '—'
  return edu
    .map((e) => [e.degree, e.school].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join('; ') || '—'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobScreenerPage() {
  // Job selection state
  const [jobStatus, setJobStatus] = useState<JobStatus>('Open')
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobsFetched, setJobsFetched] = useState(false)

  // Applicant state
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [applicantsLoading, setApplicantsLoading] = useState(false)
  const [applicantsError, setApplicantsError] = useState('')
  const [applicantsFetched, setApplicantsFetched] = useState(false)

  // Detail loading state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState<Set<string>>(new Set())
  const [enrichAllLoading, setEnrichAllLoading] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 })

  // Table state
  const [sortField, setSortField] = useState<SortField>('applyDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set())

  // ── Fetch jobs ──
  async function handleFetchJobs() {
    setJobsLoading(true)
    setJobsError('')
    setJobs([])
    setSelectedJobId('')
    setApplicants([])
    setApplicantsFetched(false)

    try {
      const res = await fetch(`/api/job-screener/jobs?status=${jobStatus}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status}). Try again.`)
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch jobs')
      setJobs(data.jobs || [])
      setJobsFetched(true)
    } catch (err: any) {
      setJobsError(err.message)
    } finally {
      setJobsLoading(false)
    }
  }

  // ── Fetch applicants (stubs only — fast) ──
  async function handleFetchApplicants() {
    if (!selectedJobId) return
    setApplicantsLoading(true)
    setApplicantsError('')
    setApplicants([])
    setExpandedId(null)

    try {
      const res = await fetch(`/api/job-screener/applicants?job_id=${selectedJobId}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(
          res.status === 504
            ? 'Request timed out. Try again.'
            : `Server error (${res.status}). Try again.`
        )
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch applicants')
      setApplicants(data.applicants || [])
      setApplicantsFetched(true)
    } catch (err: any) {
      setApplicantsError(err.message)
    } finally {
      setApplicantsLoading(false)
    }
  }

  // ── Fetch detail for a single applicant (on-demand) ──
  const fetchDetail = useCallback(async (applicantId: string) => {
    setDetailLoading((prev) => new Set(prev).add(applicantId))
    try {
      const res = await fetch(
        `/api/job-screener/applicants?applicant_id=${applicantId}&job_id=${selectedJobId}`
      )
      if (!res.ok) return
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) return
      const data = await res.json()
      if (!data.applicant) return

      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? { ...a, ...data.applicant, detailLoaded: true } : a))
      )
    } catch {
      // silently fail — stub data still shows
    } finally {
      setDetailLoading((prev) => {
        const next = new Set(prev)
        next.delete(applicantId)
        return next
      })
    }
  }, [selectedJobId])

  // ── Enrich all applicants (background batch) ──
  async function handleEnrichAll() {
    const toEnrich = applicants.filter((a) => !a.detailLoaded)
    if (toEnrich.length === 0) return

    setEnrichAllLoading(true)
    setEnrichProgress({ done: 0, total: toEnrich.length })

    const CONCURRENCY = 10
    let done = 0

    for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
      const batch = toEnrich.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (a) => {
          try {
            const res = await fetch(
              `/api/job-screener/applicants?applicant_id=${a.id}&job_id=${selectedJobId}`
            )
            if (!res.ok) return
            const contentType = res.headers.get('content-type') || ''
            if (!contentType.includes('application/json')) return
            const data = await res.json()
            if (!data.applicant) return

            setApplicants((prev) =>
              prev.map((x) => (x.id === a.id ? { ...x, ...data.applicant, detailLoaded: true } : x))
            )
          } catch {
            // skip this one
          } finally {
            done++
            setEnrichProgress({ done, total: toEnrich.length })
          }
        })
      )
    }

    setEnrichAllLoading(false)
  }

  // ── Toggle row expand ──
  function handleRowClick(applicantId: string) {
    if (expandedId === applicantId) {
      setExpandedId(null)
      return
    }
    setExpandedId(applicantId)
    // Auto-fetch detail if not loaded
    const a = applicants.find((x) => x.id === applicantId)
    if (a && !a.detailLoaded && !detailLoading.has(applicantId)) {
      fetchDetail(applicantId)
    }
  }

  // ── Sorting ──
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-slate-300">↕</span>
    return <span className="ml-1 text-slate-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Grouped + sorted applicants ──
  const groupedApplicants = useMemo(() => {
    const sorted = [...applicants].sort((a, b) => {
      const bucketDiff = BUCKET_ORDER[a.statusBucket] - BUCKET_ORDER[b.statusBucket]
      if (bucketDiff !== 0) return bucketDiff

      const aVal: string = String((a as any)[sortField] || '')
      const bVal: string = String((b as any)[sortField] || '')

      if (sortField === 'salaryRequirement') {
        const aNum = parseFloat(aVal.replace(/[^0-9.]/g, '')) || 0
        const bNum = parseFloat(bVal.replace(/[^0-9.]/g, '')) || 0
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum
      }

      if (sortField === 'applyDate') {
        const aTime = new Date(aVal).getTime() || 0
        const bTime = new Date(bVal).getTime() || 0
        return sortDir === 'asc' ? aTime - bTime : bTime - aTime
      }

      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    })

    const groups: Record<string, Applicant[]> = { Active: [], New: [], 'Not Hired': [] }
    for (const a of sorted) {
      groups[a.statusBucket].push(a)
    }
    return groups
  }, [applicants, sortField, sortDir])

  function toggleBucket(bucket: string) {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev)
      next.has(bucket) ? next.delete(bucket) : next.add(bucket)
      return next
    })
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId)
  const enrichedCount = applicants.filter((a) => a.detailLoaded).length

  const thClass =
    'text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800 whitespace-nowrap'
  const tdClass = 'text-sm text-slate-700 align-top py-3'

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Screener</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review applicants from JazzHR by job posting
          </p>
        </div>

        {/* ── Controls ── */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-wrap items-end gap-4">

            {/* Status toggle */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Job Status
              </label>
              <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
                {(['Open', 'On Hold', 'Closed', 'Cancelled'] as JobStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setJobStatus(s)
                      setJobs([])
                      setSelectedJobId('')
                      setApplicants([])
                      setJobsFetched(false)
                      setApplicantsFetched(false)
                    }}
                    className={`px-4 py-2 transition-colors ${
                      jobStatus === s
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Load jobs button */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                &nbsp;
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchJobs}
                disabled={jobsLoading}
                className="h-9"
              >
                {jobsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Load {jobStatus} Jobs
              </Button>
            </div>

            {/* Job selector */}
            {jobsFetched && jobs.length > 0 && (
              <div className="min-w-[320px]">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Select Job
                </label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Choose a job posting…" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        <span>{j.title}</span>
                        {(j.city || j.state) && (
                          <span className="text-slate-400 ml-2 text-xs">
                            {[j.city, j.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Fetch applicants */}
            {selectedJobId && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  &nbsp;
                </label>
                <Button
                  size="sm"
                  onClick={handleFetchApplicants}
                  disabled={applicantsLoading}
                  className="h-9 bg-slate-800 hover:bg-slate-700 text-white"
                >
                  {applicantsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  {applicantsLoading ? 'Fetching…' : 'Fetch Applicants'}
                </Button>
              </div>
            )}
          </div>

          {/* Job count */}
          {jobsFetched && (
            <p className="text-xs text-slate-400 mt-3">
              {jobs.length} {jobStatus} job{jobs.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Errors */}
          {jobsError && (
            <p className="text-xs text-red-500 mt-2">{jobsError}</p>
          )}
          {applicantsError && (
            <p className="text-xs text-red-500 mt-2">{applicantsError}</p>
          )}
        </div>

        {/* ── Loading state ── */}
        {applicantsLoading && (
          <div className="flex items-center gap-3 text-slate-500 py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Fetching applicants…</span>
          </div>
        )}

        {/* ── Results ── */}
        {applicantsFetched && !applicantsLoading && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-base font-semibold text-slate-800">
                {selectedJob?.title}
              </h2>
              <span className="text-sm text-slate-400">
                {applicants.length} applicant{applicants.length !== 1 ? 's' : ''}
              </span>
              {(['Active', 'New', 'Not Hired'] as const).map((b) => {
                const count = groupedApplicants[b].length
                if (count === 0) return null
                return (
                  <Badge
                    key={b}
                    variant="outline"
                    className={`text-xs ${bucketColor[b]}`}
                  >
                    {b}: {count}
                  </Badge>
                )
              })}

              {/* Enrich all button */}
              {applicants.length > 0 && enrichedCount < applicants.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnrichAll}
                  disabled={enrichAllLoading}
                  className="ml-auto h-7 text-xs"
                >
                  {enrichAllLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Loading details ({enrichProgress.done}/{enrichProgress.total})
                    </>
                  ) : (
                    'Load All Details'
                  )}
                </Button>
              )}
              {enrichedCount > 0 && enrichedCount === applicants.length && (
                <span className="ml-auto text-xs text-emerald-600">All details loaded</span>
              )}
            </div>

            <p className="text-xs text-slate-400 -mt-4">
              Click a row to expand details. Use &quot;Load All Details&quot; to fetch salary, education, and LinkedIn for everyone.
            </p>

            {applicants.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                No applicants found for this job.
              </p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200">
                      <TableHead className={thClass} onClick={() => handleSort('name')}>
                        Name <SortIcon field="name" />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => handleSort('applyDate')}>
                        Applied <SortIcon field="applyDate" />
                      </TableHead>
                      <TableHead className={thClass}>Status</TableHead>
                      <TableHead className={thClass} onClick={() => handleSort('usEligible')}>
                        US Eligible <SortIcon field="usEligible" />
                      </TableHead>
                      <TableHead
                        className={thClass}
                        onClick={() => handleSort('salaryRequirement')}
                      >
                        Salary Req. <SortIcon field="salaryRequirement" />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => handleSort('location')}>
                        Location <SortIcon field="location" />
                      </TableHead>
                      <TableHead className={thClass}>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(['Active', 'New', 'Not Hired'] as const).map((bucket) => {
                      const rows = groupedApplicants[bucket]
                      if (rows.length === 0) return null
                      const collapsed = collapsedBuckets.has(bucket)

                      return (
                        <>{/* Bucket header row */}
                          <TableRow
                            key={`bucket-${bucket}`}
                            className="bg-slate-50 cursor-pointer hover:bg-slate-100 border-y border-slate-200"
                            onClick={() => toggleBucket(bucket)}
                          >
                            <TableCell colSpan={7} className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                {collapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                )}
                                <span
                                  className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${bucketColor[bucket]}`}
                                >
                                  {bucket}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {rows.length} applicant{rows.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Applicant rows */}
                          {!collapsed &&
                            rows.map((a) => {
                              const isExpanded = expandedId === a.id
                              const isLoadingDetail = detailLoading.has(a.id)

                              return (
                                <>{/* Main row */}
                                  <TableRow
                                    key={a.id}
                                    className={`cursor-pointer hover:bg-slate-50 border-b border-slate-100 ${
                                      isExpanded ? 'bg-blue-50/50' : ''
                                    }`}
                                    onClick={() => handleRowClick(a.id)}
                                  >
                                    {/* Name */}
                                    <TableCell className={`${tdClass} font-medium text-slate-900 min-w-[160px]`}>
                                      <div className="flex items-center gap-1.5">
                                        {isExpanded ? (
                                          <ChevronDown className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                        ) : (
                                          <ChevronRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                        )}
                                        <div>
                                          {a.name}
                                          {a.email && (
                                            <div className="text-xs text-slate-400 font-normal mt-0.5">
                                              {a.email}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>

                                    {/* Apply date */}
                                    <TableCell className={`${tdClass} text-xs whitespace-nowrap`}>
                                      {formatDate(a.applyDate)}
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell className={`${tdClass} min-w-[110px]`}>
                                      <span className="text-xs text-slate-500">{a.status}</span>
                                    </TableCell>

                                    {/* US Eligible */}
                                    <TableCell className={`${tdClass} min-w-[100px]`}>
                                      {a.detailLoaded ? (
                                        a.usEligible ? (
                                          <span
                                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                              /yes|authorized|eligible/i.test(a.usEligible)
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : /no|not/i.test(a.usEligible)
                                                ? 'bg-red-50 text-red-600'
                                                : 'bg-slate-50 text-slate-500'
                                            }`}
                                          >
                                            {a.usEligible}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 text-xs">—</span>
                                        )
                                      ) : (
                                        <span className="text-slate-300 text-xs">…</span>
                                      )}
                                    </TableCell>

                                    {/* Salary */}
                                    <TableCell className={`${tdClass} min-w-[110px]`}>
                                      {a.detailLoaded ? (
                                        a.salaryRequirement || <span className="text-slate-300 text-xs">—</span>
                                      ) : (
                                        <span className="text-slate-300 text-xs">…</span>
                                      )}
                                    </TableCell>

                                    {/* Location */}
                                    <TableCell className={`${tdClass} min-w-[130px]`}>
                                      {a.detailLoaded ? (
                                        a.location || <span className="text-slate-300 text-xs">—</span>
                                      ) : (
                                        <span className="text-slate-300 text-xs">…</span>
                                      )}
                                    </TableCell>

                                    {/* Links */}
                                    <TableCell className={`${tdClass}`}>
                                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        {a.linkedinUrl && (
                                          <a
                                            href={
                                              a.linkedinUrl.startsWith('http')
                                                ? a.linkedinUrl
                                                : `https://${a.linkedinUrl}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            LI
                                          </a>
                                        )}
                                        {a.resumeUrl && (
                                          <a
                                            href={a.resumeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                                          >
                                            <FileText className="h-3 w-3" />
                                            CV
                                          </a>
                                        )}
                                        {!a.detailLoaded && !a.linkedinUrl && !a.resumeUrl && (
                                          <span className="text-slate-300 text-xs">…</span>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>

                                  {/* Expanded detail row */}
                                  {isExpanded && (
                                    <TableRow key={`${a.id}-detail`} className="bg-blue-50/30">
                                      <TableCell colSpan={7} className="px-10 py-3">
                                        {isLoadingDetail ? (
                                          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Loading details…
                                          </div>
                                        ) : a.detailLoaded ? (
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div>
                                              <span className="text-slate-400 font-medium">Education</span>
                                              <p className="text-slate-700 mt-0.5">{formatEducation(a.education)}</p>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-medium">Salary Requirement</span>
                                              <p className="text-slate-700 mt-0.5">{a.salaryRequirement || '—'}</p>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-medium">US Work Eligible</span>
                                              <p className="text-slate-700 mt-0.5">{a.usEligible || '—'}</p>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-medium">Location</span>
                                              <p className="text-slate-700 mt-0.5">{a.location || '—'}</p>
                                            </div>
                                            {a.linkedinUrl && (
                                              <div>
                                                <span className="text-slate-400 font-medium">LinkedIn</span>
                                                <p className="mt-0.5">
                                                  <a
                                                    href={a.linkedinUrl.startsWith('http') ? a.linkedinUrl : `https://${a.linkedinUrl}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    View Profile
                                                  </a>
                                                </p>
                                              </div>
                                            )}
                                            {a.resumeUrl && (
                                              <div>
                                                <span className="text-slate-400 font-medium">Resume</span>
                                                <p className="mt-0.5">
                                                  <a
                                                    href={a.resumeUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    View Resume
                                                  </a>
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-400">No additional details available.</p>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </>
                              )
                            })}
                        </>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
