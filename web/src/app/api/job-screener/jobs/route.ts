import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const maxDuration = 60

const JAZZ_BASE = 'https://api.resumatorapi.com/v1'
const API_KEY = process.env.JAZZHR_API_KEY

async function fetchAllJobs(): Promise<any[]> {
  const jobs: any[] = []
  let page = 1

  while (true) {
    const url = `${JAZZ_BASE}/jobs/page/${page}?apikey=${API_KEY}`
    const res = await fetch(url, { next: { revalidate: 0 } })

    if (!res.ok) break

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break

    jobs.push(...data)

    if (data.length < 100) break
    page++
  }

  return jobs
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!API_KEY) return NextResponse.json({ error: 'JAZZHR_API_KEY not configured' }, { status: 500 })

    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status') || 'Open' // Open, On Hold, Closed, Cancelled, or 'all'

    const allJobs = await fetchAllJobs()

    // Filter by actual status value (JazzHR API ignores status param)
    const filtered = statusFilter === 'all'
      ? allJobs
      : allJobs.filter((j) => j.status === statusFilter)

    const simplified = filtered.map((j) => ({
      id: j.id,
      title: j.title,
      department: j.department || '',
      city: j.city || '',
      state: j.state || '',
      status: j.status,
      original_open_date: j.original_open_date || '',
      applicant_count: j.applicant_count ?? null,
    }))

    // Sort alphabetically by title
    simplified.sort((a, b) => a.title.localeCompare(b.title))

    return NextResponse.json({ jobs: simplified })
  } catch (err: any) {
    console.error('JazzHR jobs error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch jobs' }, { status: 500 })
  }
}
