import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToSubscribers } from '@/lib/push'
import { getLatestBilibiliEpisode } from '@/lib/scrapers/bilibili'
import { getIqiyiLatestEpisode } from '@/lib/scrapers/iqiyi'
import { getTencentLatestEpisode } from '@/lib/scrapers/tencent'
import { PLATFORM_LABELS } from '@/types'

// Called by Vercel Cron every 30 minutes
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shows = await prisma.show.findMany({
    where: { status: 'AIRING' },
  })

  const results = []

  for (const show of shows) {
    try {
      let latestEpisode: number | null = null
      let episodeTitle: string | null = null
      const now = new Date()

      if (show.platform === 'BILIBILI') {
        const info = await getLatestBilibiliEpisode(show.platformId)
        if (info) {
          latestEpisode = parseInt(info.episode.title, 10) || shows.indexOf(show) + 1
          episodeTitle = info.episode.long_title || null
        }
      } else if (show.platform === 'IQIYI') {
        const info = await getIqiyiLatestEpisode(show.platformUrl)
        if (info) latestEpisode = info.latestEpisode
      } else if (show.platform === 'TENCENT') {
        const info = await getTencentLatestEpisode(show.platformUrl)
        if (info) latestEpisode = info.latestEpisode
      }

      if (latestEpisode !== null && latestEpisode > (show.latestEpisode ?? 0)) {
        // New episode found
        await prisma.showUpdate.create({
          data: {
            showId: show.id,
            episode: latestEpisode,
            title: episodeTitle,
            publishedAt: now,
          },
        })
        await prisma.show.update({
          where: { id: show.id },
          data: { latestEpisode, lastChecked: now },
        })
        await sendPushToSubscribers(show.id, undefined, {
          title: `${show.title} 更新了！`,
          body: `第 ${latestEpisode} 集已上线${episodeTitle ? `：${episodeTitle}` : ''}`,
          icon: show.coverImage ?? undefined,
          url: show.platformUrl,
        })
        results.push({ showId: show.id, title: show.title, newEpisode: latestEpisode })
      } else {
        await prisma.show.update({
          where: { id: show.id },
          data: { lastChecked: now },
        })
      }
    } catch (err) {
      console.error(`Failed to check show ${show.id}:`, err)
    }
  }

  return NextResponse.json({ checked: shows.length, updated: results })
}
