/**
 * Admin endpoint for manually correcting show data — protected by CRON_SECRET.
 *
 * Useful when iQiyi's aggregated data is stale for Tencent competitor shows
 * (e.g. 主角 at ep 25 while actually at ep 40).
 *
 * Example:
 *   curl -X PATCH 'https://your-app.vercel.app/api/admin/shows?secret=YOUR_CRON_SECRET' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"title":"主角","latestEpisode":40,"totalEpisodes":48}'
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { ShowStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secretParam = searchParams.get('secret')
  const authHeader = req.headers.get('authorization')

  const authorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secretParam === process.env.CRON_SECRET

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, title, latestEpisode, totalEpisodes, status } = body

  if (!id && !title) {
    return NextResponse.json({ error: 'id or title required' }, { status: 400 })
  }

  // Find the show
  let show = null
  if (id) {
    show = await prisma.show.findUnique({ where: { id } })
  } else {
    // Match by title (spaces-normalized, case-insensitive)
    const normalized = String(title).replace(/\s+/g, '')
    const candidates = await prisma.show.findMany({
      where: { title: { contains: String(title).split('').slice(0, 4).join(''), mode: 'insensitive' } },
      take: 10,
    })
    show =
      candidates.find((c) => c.title.replace(/\s+/g, '') === normalized) ??
      candidates.find((c) =>
        c.title.replace(/\s+/g, '').includes(normalized) ||
        normalized.includes(c.title.replace(/\s+/g, '')),
      ) ??
      null
  }

  if (!show) {
    // List all shows so the caller can pick the right one
    const all = await prisma.show.findMany({ select: { id: true, title: true, platform: true, latestEpisode: true }, orderBy: { title: 'asc' } })
    return NextResponse.json({ error: 'Show not found', allShows: all }, { status: 404 })
  }

  // Build update payload
  const data: {
    latestEpisode?: number
    totalEpisodes?: number
    status?: ShowStatus
  } = {}
  if (typeof latestEpisode === 'number' && latestEpisode > 0) data.latestEpisode = latestEpisode
  if (typeof totalEpisodes === 'number' && totalEpisodes > 0) data.totalEpisodes = totalEpisodes
  if (typeof status === 'string') data.status = status as ShowStatus

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No updatable fields; provide latestEpisode, totalEpisodes, or status', found: show }, { status: 400 })
  }

  const updated = await prisma.show.update({ where: { id: show.id }, data })

  // Also seed a ShowUpdate for the new latestEpisode if one doesn't exist
  if (typeof latestEpisode === 'number' && latestEpisode > 0) {
    const existing = await prisma.showUpdate.findFirst({
      where: { showId: show.id, episode: latestEpisode },
    })
    if (!existing) {
      await prisma.showUpdate.create({
        data: { showId: show.id, episode: latestEpisode, publishedAt: new Date() },
      }).catch(() => {})
      console.log(`[admin/shows] seeded ShowUpdate for ${show.title} ep${latestEpisode}`)
    }
  }

  console.log(`[admin/shows] updated "${show.title}": ${JSON.stringify(data)}`)
  return NextResponse.json({ ok: true, before: { latestEpisode: show.latestEpisode, totalEpisodes: show.totalEpisodes, status: show.status }, after: updated })
}

/** GET: list all shows (for inspection) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secretParam = searchParams.get('secret')
  const authHeader = req.headers.get('authorization')

  const authorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secretParam === process.env.CRON_SECRET

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shows = await prisma.show.findMany({
    select: {
      id: true,
      title: true,
      platform: true,
      status: true,
      latestEpisode: true,
      totalEpisodes: true,
      lastChecked: true,
    },
    orderBy: { title: 'asc' },
  })

  return NextResponse.json(shows)
}
