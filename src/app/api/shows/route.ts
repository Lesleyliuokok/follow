import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
import { searchBilibiliShows } from '@/lib/scraper/bilibili'
import { searchDoubanShows } from '@/lib/scraper/douban'
import { resolveShowPlatform, searchIqiyiShows } from '@/lib/scraper/iqiyi'
import type { Platform } from '@prisma/client'

function fallbackPlatformUrl(title: string, platform: Platform): string {
  const q = encodeURIComponent(title)
  if (platform === 'IQIYI') return `https://www.iqiyi.com/search.html#query=${q}&channel=5`
  if (platform === 'TENCENT') return `https://v.qq.com/x/search/?q=${q}`
  if (platform === 'DOUYIN') return `https://www.douyin.com/search/${q}`
  return ''
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  // ── No query: return recent shows ────────────────────────────────────────
  const NO_CACHE = { 'Cache-Control': 'no-store' }

  if (!q) {
    const shows = await prisma.show.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })
    return NextResponse.json(shows, { headers: NO_CACHE })
  }

  // ── Search: run Bilibili + iQiyi aggregated in parallel ─────────────────
  const [localShows, biliShows, iqiyiShows, doubanShows] = await Promise.all([
    // Local DB — all platforms
    prisma.show.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    // Bilibili bangumi search
    searchBilibiliShows(q).catch(() => []),
    // iQiyi aggregated (covers IQIYI + TENCENT)
    searchIqiyiShows(q, 10).catch(() => []),
    // Douban for extra metadata / shows not yet on iQiyi aggregated
    searchDoubanShows(q).catch(() => []),
  ])

  // ── Upsert Bilibili results ───────────────────────────────────────────────
  const biliUpserted = await Promise.all(
    biliShows.map((item) =>
      prisma.show
        .upsert({
          where: { platform_platformId: { platform: 'BILIBILI', platformId: item.platformId } },
          update: {
            title: item.title,
            coverImage: item.coverImage,
            platformUrl: item.platformUrl,
            latestEpisode: item.latestEpisode,
            status: item.status,
          },
          create: {
            platform: 'BILIBILI',
            platformId: item.platformId,
            title: item.title,
            coverImage: item.coverImage,
            platformUrl: item.platformUrl,
            latestEpisode: item.latestEpisode,
            status: item.status,
          },
        })
        .catch(() => null),
    ),
  )

  // ── Upsert iQiyi aggregated results (IQIYI + TENCENT) ───────────────────
  const iqiyiUpserted = await Promise.all(
    iqiyiShows.map(async (item) => {
      if (!item.platformId) return null  // guard: never persist empty platformId
      try {
        // Match by albumId or exact title+platform first
        let existing = await prisma.show.findFirst({
          where: {
            OR: [
              { platformId: item.platformId },
              { title: item.title, platform: item.platform },
            ],
          },
        })

        // Fallback: space-normalized title match via raw SQL
        // iQiyi sometimes returns "庆余年第二季" while DB has "庆余年 第二季"
        if (!existing) {
          const normalizedTitle = item.title.replace(/\s+/g, '')
          const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Show"
            WHERE platform = ${item.platform}
            AND REPLACE(title, ' ', '') ILIKE ${normalizedTitle}
            LIMIT 1
          `
          if (rows[0]) {
            existing = await prisma.show.findUnique({ where: { id: rows[0].id } })
          }
        }
        if (existing) {
          return prisma.show.update({
            where: { id: existing.id },
            data: {
              // Always upgrade to the canonical iQiyi albumId
              platformId: item.platformId,
              // Preserve existing title if it differs only in spacing (iQiyi may strip spaces)
              title: existing.title.replace(/\s+/g, '') === item.title.replace(/\s+/g, '')
                ? existing.title
                : item.title,
              coverImage: item.coverImage ?? existing.coverImage,
              totalEpisodes: item.totalEpisodes ?? existing.totalEpisodes,
              latestEpisode: item.latestEpisode ?? existing.latestEpisode,
              status: item.status,
              description: item.description ?? existing.description,
              platformUrl: item.platformUrl.includes('search') && !existing.platformUrl.includes('search')
                ? existing.platformUrl  // keep better URL if we already have a direct link
                : item.platformUrl,
            },
          })
        }
        return prisma.show.create({
          data: {
            platform: item.platform,
            platformId: item.platformId,
            title: item.title,
            coverImage: item.coverImage,
            totalEpisodes: item.totalEpisodes,
            latestEpisode: item.latestEpisode,
            status: item.status,
            description: item.description,
            platformUrl: item.platformUrl,
          },
        })
      } catch {
        return null
      }
    }),
  )

  // ── Upsert Douban results (fallback for shows not in iQiyi aggregated) ───
  const doubanUpserted = await Promise.all(
    doubanShows.map(async (item) => {
      try {
        // Skip if already covered by iQiyi aggregated results (same doubanId)
        const alreadyCovered = item.doubanId && iqiyiShows.some((s) => s.doubanId === item.doubanId)
        if (alreadyCovered) return null

        // Cross-reference with iQiyi FIRST so we know the canonical albumId
        const resolved = await resolveShowPlatform(item.title, item.doubanId).catch(() => null)
        const platform = resolved?.platform ?? 'TENCENT'

        // Prefer iQiyi albumId as canonical platformId; fall back to doubanId
        const canonicalId = resolved?.platformId ?? item.doubanId
        if (!canonicalId) return null  // never create a record with empty platformId

        // Find existing by any of: resolved albumId, doubanId, or title+platform
        const orClauses: object[] = [
          { title: item.title, platform },
        ]
        if (resolved?.platformId) orClauses.unshift({ platformId: resolved.platformId })
        if (item.doubanId) orClauses.unshift({ platformId: item.doubanId })

        const existing = await prisma.show.findFirst({ where: { OR: orClauses } })

        if (existing) {
          return prisma.show.update({
            where: { id: existing.id },
            data: {
              title: item.title,
              // Upgrade to albumId if we now have it (replaces old doubanId-as-platformId)
              platformId: resolved?.platformId ?? existing.platformId,
              coverImage: resolved?.coverImage ?? item.coverImage ?? existing.coverImage,
              totalEpisodes: resolved?.totalEpisodes ?? item.totalEpisodes ?? existing.totalEpisodes,
              latestEpisode: resolved?.latestEpisode ?? existing.latestEpisode,
              status: resolved?.status ?? existing.status,
              description: resolved?.description ?? existing.description,
              platformUrl: resolved?.platformUrl ?? existing.platformUrl,
            },
          })
        }

        return prisma.show.create({
          data: {
            platform,
            platformId: canonicalId,
            title: item.title,
            coverImage: resolved?.coverImage ?? item.coverImage,
            totalEpisodes: resolved?.totalEpisodes ?? item.totalEpisodes,
            latestEpisode: resolved?.latestEpisode ?? null,
            status: resolved?.status ?? 'AIRING',
            description: resolved?.description ?? null,
            platformUrl: resolved?.platformUrl ?? fallbackPlatformUrl(item.title, platform),
          },
        })
      } catch {
        return null
      }
    }),
  )

  // ── Merge & deduplicate ──────────────────────────────────────────────────
  const localIds = new Set(localShows.map((s) => s.id))
  const seenIds = new Set(localShows.map((s) => s.id))
  // Normalize titles by removing spaces for dedup (handles "庆余年第二季" vs "庆余年 第二季")
  const seenTitles = new Set(localShows.map((s) => s.title.toLowerCase().replace(/\s+/g, '')))

  const newShows = [...biliUpserted, ...iqiyiUpserted, ...doubanUpserted].filter(
    (s): s is NonNullable<typeof s> => {
      if (!s) return false
      if (localIds.has(s.id)) return false  // already in localShows
      if (seenIds.has(s.id)) return false
      const normalizedTitle = s.title.toLowerCase().replace(/\s+/g, '')
      if (seenTitles.has(normalizedTitle)) return false
      seenIds.add(s.id)
      seenTitles.add(normalizedTitle)
      return true
    },
  )

  return NextResponse.json([...localShows, ...newShows].slice(0, 20), { headers: NO_CACHE })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const show = await prisma.show.upsert({
    where: { platform_platformId: { platform: body.platform, platformId: body.platformId } },
    create: body,
    update: { title: body.title, coverImage: body.coverImage, platformUrl: body.platformUrl },
  })

  return NextResponse.json(show, { status: 201 })
}
