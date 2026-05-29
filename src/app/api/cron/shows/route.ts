import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToSubscribers } from '@/lib/push'
import { sendWeChatToSubscribers } from '@/lib/wechat'
import { getLatestBilibiliEpisode } from '@/lib/scrapers/bilibili'
import { getIqiyiLatestEpisode } from '@/lib/scrapers/iqiyi'
import { getTencentLatestEpisode } from '@/lib/scrapers/tencent'
import { getYoukuLatestEpisode } from '@/lib/scrapers/youku'
import { PLATFORM_LABELS } from '@/types'

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

  const results: { title: string; newEpisode: number }[] = []
  const now = new Date()

  for (const show of shows) {
    try {
      let latestEpisode: number | null = null
      let episodeTitle: string | null = null
      let newTotalEpisodes: number | null = null
      let forceCompleted = false

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
      // Priority: explicit forceCompleted > episode-count comparison > episode presence
      const effectiveTotal = newTotalEpisodes ?? show.totalEpisodes
      let newStatus: 'AIRING' | 'COMPLETED' | 'UPCOMING' =
        show.status as 'AIRING' | 'COMPLETED' | 'UPCOMING'

      if (forceCompleted) {
        newStatus = 'COMPLETED'
      } else if (latestEpisode !== null && latestEpisode > 0) {
        // Has at least one episode → definitely airing (not upcoming)
        newStatus = 'AIRING'
        // All episodes released → completed
        if (effectiveTotal !== null && latestEpisode >= effectiveTotal) {
          newStatus = 'COMPLETED'
        }
      }

      const episodeAdvanced = latestEpisode !== null && latestEpisode > (show.latestEpisode ?? 0)
      const statusChanged = newStatus !== show.status

      // Build update payload
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

      // Send push notification only when a genuinely new episode is out on a non-completed show
      if (episodeAdvanced && newStatus !== 'COMPLETED') {
        await prisma.showUpdate.create({
          data: {
            showId: show.id,
            episode: latestEpisode!,
            title: episodeTitle,
            publishedAt: now,
          },
        })
        // Browser push + WeChat template message in parallel
        await Promise.allSettled([
          sendPushToSubscribers(show.id, undefined, {
            title: `${show.title} 更新了！`,
            body: `第 ${latestEpisode} 集已上线${episodeTitle ? `：${episodeTitle}` : ''}`,
            icon: show.coverImage ?? undefined,
            url: show.platformUrl,
          }),
          sendWeChatToSubscribers(show.id, {
            showTitle: show.title,
            episode: latestEpisode!,
            episodeTitle,
            showUrl: show.platformUrl,
          }),
        ])
        results.push({ title: show.title, newEpisode: latestEpisode! })
        console.log(`[cron/shows] ${show.title} → ep ${latestEpisode}`)
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
