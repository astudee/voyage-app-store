import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const JAZZ_BASE = 'https://api.resumatorapi.com/v1'
const API_KEY = process.env.JAZZHR_API_KEY

// Fetch all applicant stubs for a job (paginated)
async function fetchApplicantStubs(jobId: string): Promise<any[]> {
  const applicants: any[] = []
  let page = 1

  while (true) {
    const url = `${JAZZ_BASE}/applicants/page/${page}?apikey=${API_KEY}&job_id=${jobId}`
    const res = await fetch(url, { next: { revalidate: 0 } })

    if (!res.ok) break

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break

    applicants.push(...data)
    if (data.length < 100) break
    page++
  }

  return applicants
}

// Fetch full applicant detail (includes questionnaire answers, resume, linkedin, etc.)
async function fetchApplicantDetail(applicantId: string): Promise<any | null> {
  try {
    const url = `${JAZZ_BASE}/applicants/${applicantId}?apikey=${API_KEY}`
    const res = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Parse questionnaire answers to extract key fields
function parseQuestionnaire(questions: any[]): {
  salaryRequirement: string
  linkedinUrl: string
  usEligible: string
  education: Array<{ degree: string; school: string }>
} {
  const result = {
    salaryRequirement: '',
    linkedinUrl: '',
    usEligible: '',
    education: [] as Array<{ degree: string; school: string }>,
  }

  if (!Array.isArray(questions)) return result

  for (const q of questions) {
    const label = (q.question || q.label || '').toLowerCase()
    const answer = q.answer || q.answers || ''
    const answerStr = Array.isArray(answer) ? answer.join(', ') : String(answer || '')

    // Salary
    if (label.includes('salary') || label.includes('compensation') || label.includes('pay')) {
      result.salaryRequirement = answerStr
    }

    // LinkedIn
    if (label.includes('linkedin')) {
      result.linkedinUrl = answerStr
    }

    // US work eligibility
    if (
      label.includes('authorized') ||
      label.includes('eligible') ||
      label.includes('work in the us') ||
      label.includes('legally')
    ) {
      result.usEligible = answerStr
    }

    // Education — degree field
    if (label.includes('degree') || label.includes('education')) {
      result.education.push({ degree: answerStr, school: '' })
    }

    // School / university
    if (label.includes('university') || label.includes('college') || label.includes('school')) {
      if (result.education.length > 0) {
        result.education[result.education.length - 1].school = answerStr
      } else {
        result.education.push({ degree: '', school: answerStr })
      }
    }
  }

  return result
}

// Map JazzHR status to our display buckets
function statusBucket(status: string): 'Active' | 'New' | 'Not Hired' {
  const s = (status || '').toLowerCase()
  if (s.includes('new')) return 'New'
  if (
    s.includes('rejected') ||
    s.includes('not hired') ||
    s.includes('declined') ||
    s.includes('withdrawn')
  )
    return 'Not Hired'
  return 'Active'
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!API_KEY) return NextResponse.json({ error: 'JAZZHR_API_KEY not configured' }, { status: 500 })

    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('job_id')

    if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })

    // 1. Get all applicant stubs for this job
    const stubs = await fetchApplicantStubs(jobId)

    // 2. Enrich each with detail record (parallel, capped at 30 concurrent)
    const CONCURRENCY = 30
    const enriched: any[] = []

    for (let i = 0; i < stubs.length; i += CONCURRENCY) {
      const batch = stubs.slice(i, i + CONCURRENCY)
      const details = await Promise.all(batch.map((s) => fetchApplicantDetail(s.id)))

      for (let j = 0; j < batch.length; j++) {
        const stub = batch[j]
        const detail = details[j] || {}

        // Merge — detail overrides stub where present
        const merged = { ...stub, ...detail }

        // Parse questionnaire
        const qAnswers = merged.questionnaire || merged.questions || []
        const parsed = parseQuestionnaire(qAnswers)

        // Also check top-level fields that JazzHR sometimes surfaces directly
        const linkedinUrl =
          parsed.linkedinUrl ||
          merged.linkedin ||
          merged.linkedin_url ||
          ''

        const salaryRequirement =
          parsed.salaryRequirement ||
          merged.desired_salary ||
          merged.salary ||
          ''

        const usEligible =
          parsed.usEligible ||
          merged.us_work_authorization ||
          ''

        const location = [merged.city, merged.state, merged.country]
          .filter(Boolean)
          .join(', ')

        enriched.push({
          id: merged.id,
          firstName: merged.first_name || '',
          lastName: merged.last_name || '',
          name: `${merged.first_name || ''} ${merged.last_name || ''}`.trim(),
          email: merged.email || '',
          location,
          applyDate: merged.apply_date || '',
          status: merged.status || '',
          statusBucket: statusBucket(merged.status || ''),
          resumeUrl: merged.resume_link || merged.resume || '',
          linkedinUrl,
          salaryRequirement,
          usEligible,
          education: parsed.education,
          jobId: merged.job_id || jobId,
          jobTitle: merged.job_title || '',
          rating: merged.rating || '',
        })
      }
    }

    // Sort: Active first, then New, then Not Hired; within each bucket by apply date desc
    const bucketOrder: Record<string, number> = { Active: 0, New: 1, 'Not Hired': 2 }
    enriched.sort((a, b) => {
      const bo = bucketOrder[a.statusBucket] - bucketOrder[b.statusBucket]
      if (bo !== 0) return bo
      return new Date(b.applyDate).getTime() - new Date(a.applyDate).getTime()
    })

    return NextResponse.json({
      applicants: enriched,
      total: enriched.length,
    })
  } catch (err: any) {
    console.error('JazzHR applicants error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch applicants' }, { status: 500 })
  }
}
