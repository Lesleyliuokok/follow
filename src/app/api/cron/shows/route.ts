import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToSubscribers } from '@/lib/push'
import { sendWeChatToSubscribers } from '@/lib/wechat'
import { getLatestBilibiliEpisode } from '@/lib/scrapers/bilibili'
import { getIqiyiLatestEpisode } from '@/lib/scrapers/iqiyi'
import { getTencentLatestEpisode } from '@/lib/scrapers/tencent'
import { getYoukuLatestEpisode } from '@/lib/scrapers/youku'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import { PLATFORM_LABELS } from '@/types'

export const dynamic = 'force-dynamic'

// Called by Vercel Cron every 30 min — or manually via GET /api/cron/shows?secret=CRON_SECRET
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

  // Check both AIRING and UPCOMING — UPCOMING shows may have started or even finished
  // by the time we check, and without this they'd stay UPCOMING indefinitely.
  const shows = await prisma.show.findMany({
    where: { status: { in: ['AIRING', 'UPCOMING'] } },
  })

  const results: { title: string; newEpisode: number; action: string }[] = []
  const now = new Date()

  for (const show of shows) {
    try {
      let latestEpisode: number | null = null
      let episodeTitle: string | null = null
      let newTotalEpisodes: number | null = null
      let forceCompleted = false
      // Default to now; Bilibili overrides with actual pub_time
      let episodePublishedAt: Date = now

      if (show.platform === 'BILIBILI') {
        // Extract season_id from the platformUrl (e.g. .../bangumi/play/ss26257 → "26257")
        const seasonId = show.platformUrl.match(/\/ss(\d+)/)?.[1]
        if (!seasonId) continue

        const info = await getLatestBilibiliEpisode(seasonId)
        if (info) {
          const epNum = parseInt(info.episode.title, 10)
          if (!isNaN(epNum)) {
            latestEpisode = epNum
            episodeTitle = info.episode.long_title || null
            // Use the real air date from Bilibili's API (Unix timestamp → Date)
            if (info.episode.pub_time > 0) {
              episodePublishedAt = new Date(info.episode.pub_time * 1000)
            }
          }
          if (info.season.is_finish === 1) forceCompleted = true
        }
      } else if (show.platform === 'IQIYI') {
        const info = await getIqiyiLatestEpisode(show.platformUrl)
        if (info) {
          latestEpisode = info.latestEpisode
          newTotalEpisodes = info.totalEpisodes
        }
      } else if (show.platform === 'TENCENT') {
        const info = await getTencentLatestEpisode(show.platformUrl, show.title, show.platformId)
        if (info) {
          latestEpisode = info.latestEpisode
          newTotalEpisodes = info.totalEpisodes
          forceCompleted = info.isCompleted
          // Auto-fix platformUrl to the clean cover page URL if currently wrong
          if (info.coverUrl !== show.platformUrl && info.coverUrl.includes('/x/cover/')) {
            await prisma.show.update({
              where: { id: show.id },
              data: { platformUrl: info.coverUrl },
            })
            console.log(`[cron/shows] fixed Tencent URL for ${show.title}: ${info.coverUrl}`)
          }
        }

        // Extra fallback for Tencent: direct iQiyi aggregated search with wider net.
        // getTencentLatestEpisode uses limit=20 internally; retry with 50 + platformId match.
        if (latestEpisode === null) {
          const iqResults = await searchIqiyiShows(show.title, 50).catch(() => [])
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
          const match = iqResults.find(
            (r) =>
              r.platform === 'TENCENT' &&
              (r.platformId === show.platformId || norm(r.title) === norm(show.title)),
          )
          if (match?.latestEpisode) {
            latestEpisode = match.latestEpisode
            newTotalEpisodes = match.totalEpisodes ?? newTotalEpisodes
            console.log(`[cron/shows] Tencent fallback found ${show.title} → ep ${latestEpisode}`)
          }
        }
      } else if (show.platform === 'YOUKU') {
        const info = await getYoukuLatestEpisode(show.platformUrl, show.title, show.platformId)
        if (info) {
          latestEpisode = info.latestEpisode
          newTotalEpisodes = info.totalEpisodes
          forceCompleted = info.isCompleted
          // Auto-fix platformUrl to canonical album page URL if currently wrong
          if (info.platformUrl !== show.platformUrl && info.platformUrl.includes('/v_nextstage/')) {
            await prisma.show.update({
              where: { id: show.id },
              data: { platformUrl: info.platformUrl },
            })
            console.log(`[cron/shows] fixed Youku URL for ${show.title}: ${info.platformUrl}`)
          }
        }
      }

      // ── Determine new status ────────────────────────────────────────────────
      const effectiveTotal = newTotalEpisodes ?? show.totalEpisodes
      let newStatus: 'AIRING' | 'COMPLETED' | 'UPCOMING' =
        show.status as 'AIRING' | 'COMPLETED' | 'UPCOMING'

      if (forceCompleted) {
        newStatus = 'COMPLETED'
      } else if (latestEpisode !== null && latestEpisode > 0) {
        newStatus = 'AIRING'
        if (effectiveTotal !== null && latestEpisode >= effectiveTotal) {
          newStatus = 'COMPLETED'
        }
      }

      // Use freshly scraped value, or fall back to what's already stored in the DB
      const effectiveEpisode = latestEpisode ?? show.latestEpisode
      const episodeToRecord = effectiveEpisode  // may be null if we have no data at all
      const episodeAdvanced = latestEpisode !== null && latestEpisode > (show.latestEpisode ?? 0)
      const statusChanged = newStatus !== show.status

      // Build show update payload
      const updateData: {
        lastChecked: Date
        latestEpisode?: number
        totalEpisodes?: number
        status?: 'AIRING' | 'COMPLETED' | 'UPCOMING'
      } = { lastChecked: now }

      if (latestEpisode !== null) updateData.latestEpisode = latestEpisode
      if (newTotalEpisodes !== null && newTotalEpisodes !== show.totalEpisodes) {
        updateData.totalEpisodes = newTotalEpisodes
      }
      if (statusChanged) {
        updateData.status = newStatus
        console.log(`[cron/shows] ${show.title} status ${show.status} → ${newStatus}`)
      }

      // ── ShowUpdate: create new or correct the date of an existing one ───────
      if (episodeToRecord !== null && episodeToRecord > 0) {
        // Look up existing ShowUpdate for this exact episode
        const existing = await prisma.showUpdate.findFirst({
          where: { showId: show.id, episode: episodeToRecord },
          select: { id: true, publishedAt: true, title: true },
        })

        if (existing) {
          // Date correction: if we have a better (earlier) date, update it.
          // 3600s threshold avoids touching records that are already accurate.
          const betterDate = episodePublishedAt < existing.publishedAt &&
            existing.publishedAt.getTime() - episodePublishedAt.getTime() > 3_600_000
          if (betterDate) {
            await prisma.showUpdate.update({
              where: { id: existing.id },
              data: {
                publishedAt: episodePublishedAt,
                title: episodeTitle ?? existing.title,
              },
            })
            results.push({ title: show.title, newEpisode: episodeToRecord, action: 'date-corrected' })
            console.log(
              `[cron/shows] ${show.title} ep${episodeToRecord} date corrected → ${episodePublishedAt.toISOString()}`,
            )
          }
        } else if (episodeAdvanced) {
          // New episode! Create ShowUpdate + send notifications
          await prisma.showUpdate.create({
            data: {
              showId: show.id,
              episode: episodeToRecord,
              title: episodeTitle,
              publishedAt: episodePublishedAt,
            },
          })
          results.push({ title: show.title, newEpisode: episodeToRecord, action: 'new-episode' })
          console.log(`[cron/shows] ${show.title} → ep ${episodeToRecord} (new) @ ${episodePublishedAt.toISOString()}`)

          if (newStatus !== 'COMPLETED') {
            await Promise.allSettled([
              sendPushToSubscribers(show.id, undefined, {
                title: `${show.title} 更新了！`,
                body: `第 ${episodeToRecord} 集已上线${episodeTitle ? `：${episodeTitle}` : ''}`,
                icon: show.coverImage ?? undefined,
                url: show.platformUrl,
              }),
              sendWeChatToSubscribers(show.id, {
                showTitle: show.title,
                episode: episodeToRecord,
                episodeTitle,
                showUrl: show.platformUrl,
              }),
            ])
          }
        } else {
          // Not a new episode — seed first-track ShowUpdate if none exists yet for this show
          const anyCount = await prisma.showUpdate.count({ where: { showId: show.id } })
          if (anyCount === 0) {
            await prisma.showUpdate.create({
              data: {
                showId: show.id,
                episode: episodeToRecord,
                title: episodeTitle,
                publishedAt: episodePublishedAt,
              },
            })
            results.push({ title: show.title, newEpisode: episodeToRecord, action: 'first-track-seed' })
            console.log(
              `[cron/shows] ${show.title} first-track seed ep${episodeToRecord} @ ${episodePublishedAt.toISOString()}`,
            )
          }
        }
      }

      await prisma.show.update({ where: { id: show.id }, data: updateData })
    } catch (err) {
      console.error(`[cron/shows] failed for ${show.title}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    checked: shows.length,
    shows: shows.map((s) => `${s.title} (${PLATFORM_LABELS[s.platform]})`),
    updated: results,
  })
}
