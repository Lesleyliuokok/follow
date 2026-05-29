import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import type { ShowStatus } from '@prisma/client'

// ── PATCH /api/shows/[id] — update platformUrl (and optionally other fields) ──
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const data: {
    platformUrl?: string
    status?: ShowStatus
    totalEpisodes?: number | null
    latestEpisode?: number | null
  } = {}

  if (typeof body.platformUrl === 'string') data.platformUrl = body.platformUrl
  if (typeof body.status === 'string') data.status = body.status as ShowStatus
  if ('totalEpisodes' in body) data.totalEpisodes = body.totalEpisodes ?? null
  if ('latestEpisode' in body) data.latestEpisode = body.latestEpisode ?? null

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const show = await prisma.show.update({ where: { id }, data })
  return NextResponse.json(show)
}

// ── POST /api/shows/[id]/refresh — re-run iQiyi search to fix URL ────────────
// (This is handled below as a sub-route but kept here to avoid extra files)

// ── GET /api/shows/[id]/refresh-url ──────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action !== 'refresh-url') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const show = await prisma.show.findUnique({ where: { id } })
  if (!show) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Re-run iQiyi aggregated search for this show's title
  const results = await searchIqiyiShows(show.title, 10)

  // Find the best match: same platform + similar title
  const normalizedTitle = show.title.toLowerCase().replace(/\s+/g, '')
  const match = results.find(
    (r) =>
      r.platform === show.platform &&
      (r.platformId === show.platformId ||
        r.title.toLowerCase().replace(/\s+/g, '') === normalizedTitle),
  )

  if (!match) {
    return NextResponse.json({ ok: false, message: '未找到匹配结果' })
  }

  const hasSearchUrl = match.platformUrl.includes('/x/search/') || match.platformUrl.includes('search.html')
  if (hasSearchUrl) {
    return NextResponse.json({ ok: false, message: '仅找到搜索链接，无法自动修复' })
  }

  // Update with the resolved URL
  await prisma.show.update({
    where: { id },
    data: { platformUrl: match.platformUrl },
  })

  return NextResponse.json({ ok: true, platformUrl: match.platformUrl })
}
