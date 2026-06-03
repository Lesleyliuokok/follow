/**
 * /api/cron/enrich — cross-platform enrichment
 *
 * For every non-BILIBILI show in the DB that doesn't yet have a Bilibili
 * extraPlatform, search Bilibili and add the link if found.
 *
 * Runs once per day via GitHub Actions (.github/workflows/cron-enrich.yml).
 * Can also be triggered manually: GET /api/cron/enrich?secret=CRON_SECRET
 *
 * Rate-limited to BATCH_SIZE shows per run with a short delay between
 * Bilibili API calls to avoid triggering rate limits.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliShows } from '@/lib/scraper/bilibili'

export const dynamic = 'force-dynamic'
// Each Bilibili search takes ~1s; 30 shows × 1s = 30s — well within the 60s Vercel limit
export const maxDuration = 60

const BATCH_SIZE = 30
const DELAY_MS = 300  // ms between Bilibili API calls

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[【】()（）]/g, '')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const secretParam = searchParams.get('secret')

  const authorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secretParam === process.env.CRON_SECRET

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Find shows to enrich ─────────────────────────────────────────────────
  // Prioritise currently-airing shows; skip BILIBILI shows (they're already on Bilibili)
  const candidates = await prisma.show.findMany({
    where: {
      platform: { not: 'BILIBILI' },
      status: { in: ['AIRING', 'UPCOMING'] },
    },
    select: { id: true, title: true, platform: true, extraPlatforms: true },
    orderBy: { updatedAt: 'desc' },
    take: BATCH_SIZE * 3,  // fetch extra so we have room after filtering
  })

  // Keep only those that don't already have a Bilibili entry
  const toEnrich = candidates
    .filter((s) => {
      const extras = Array.isArray(s.extraPlatforms)
        ? (s.extraPlatforms as { platform: string }[])
        : []
      return !extras.some((e) => e.platform === 'BILIBILI')
    })
    .slice(0, BATCH_SIZE)

  if (toEnrich.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, enriched: [], message: 'Nothing to enrich' })
  }

  // ── Search Bilibili for each show ────────────────────────────────────────
  const enriched: string[] = []
  const notFound: string[] = []

  for (const show of toEnrich) {
    await sleep(DELAY_MS)

    try {
      const biliResults = await searchBilibiliShows(show.title)
      const match = biliResults.find((r) => norm(r.title) === norm(show.title))

      if (match) {
        const existingExtras = Array.isArray(show.extraPlatforms)
          ? (show.extraPlatforms as { platform: string; platformUrl: string; id: string }[])
          : []

        await prisma.show.update({
          where: { id: show.id },
          data: {
            extraPlatforms: [
              ...existingExtras,
              { platform: 'BILIBILI', platformUrl: match.platformUrl, id: match.platformId },
            ] as unknown as object,
          },
        })

        const msg = `${show.title} (${show.platform}) → ${match.platformUrl}`
        enriched.push(msg)
        console.log(`[cron/enrich] ✓ ${msg}`)
      } else {
        notFound.push(show.title)
      }
    } catch (err) {
      console.error(`[cron/enrich] error for "${show.title}":`, err)
    }
  }

  console.log(`[cron/enrich] done: ${enriched.length} enriched, ${notFound.length} not found on Bilibili`)

  return NextResponse.json({
    ok: true,
    checked: toEnrich.length,
    enriched,
    notFound,
  })
}
