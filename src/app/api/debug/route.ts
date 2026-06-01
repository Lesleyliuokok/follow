import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import { getWetvEpisodeInfo } from '@/lib/scrapers/wetv'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 1. DB health + counts
  let dbWriteOk = false
  let dbWriteError = ''
  try {
    const created = await prisma.celebrity.create({ data: { name: '__debug_test__' } })
    const found = await prisma.celebrity.findUnique({ where: { id: created.id } })
    dbWriteOk = found?.id === created.id
    await prisma.celebrity.delete({ where: { id: created.id } }).catch(() => {})
  } catch (e) {
    dbWriteError = e instanceof Error ? e.message : String(e)
  }

  const [showCount, celebCount, subCount, showUpdateCount] = await Promise.all([
    prisma.show.count(),
    prisma.celebrity.count(),
    prisma.subscription.count(),
    prisma.showUpdate.count(),
  ])

  // 2. External scrapers
  const [biliUsers, doubanCelebs, iqiyiZhuJue, wetvZhuJue] = await Promise.allSettled([
    searchBilibiliUsers('刘浩存'),
    searchDoubanCelebrities('刘浩存'),
    searchIqiyiShows('主角', 50).then((results) => {
      const match = results.find(
        (r) => r.platform === 'TENCENT' && r.title.replace(/\s+/g, '') === '主角',
      )
      return match
        ? { found: true, latestEpisode: match.latestEpisode, totalEpisodes: match.totalEpisodes }
        : { found: false, totalResults: results.length }
    }),
    getWetvEpisodeInfo('主角'),
  ])

  // 3. Tencent CDN reachability check
  let tencentReachable = false
  try {
    const { data } = await axios.get('https://node.video.qq.com/x/api/float_vinfo2', {
      params: { cid: 'mzc002009g0nh88', ep_id: '', refer: 'mobile' },
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148' },
    })
    tencentReachable = !!data?.c?.title
  } catch { /* unreachable */ }

  const dbHost = (process.env.DATABASE_URL ?? '').replace(/:\/\/[^@]+@/, '://***@').split('/')[2] ?? 'unknown'

  return NextResponse.json({
    db: {
      host: dbHost,
      writeReadOk: dbWriteOk,
      error: dbWriteError || null,
      counts: { shows: showCount, celebrities: celebCount, subscriptions: subCount, showUpdates: showUpdateCount },
    },
    scrapers: {
      bilibiliUsers:
        biliUsers.status === 'fulfilled' ? biliUsers.value.map((u) => u.name) : `error: ${(biliUsers as PromiseRejectedResult).reason}`,
      douban:
        doubanCelebs.status === 'fulfilled' ? doubanCelebs.value.map((c) => c.name) : `error: ${(doubanCelebs as PromiseRejectedResult).reason}`,
      iqiyi_zhuJue:
        iqiyiZhuJue.status === 'fulfilled' ? iqiyiZhuJue.value : `error: ${(iqiyiZhuJue as PromiseRejectedResult).reason}`,
      wetv_zhuJue:
        wetvZhuJue.status === 'fulfilled' ? wetvZhuJue.value : `error: ${(wetvZhuJue as PromiseRejectedResult).reason}`,
    },
    tencent: {
      cdn_reachable: tencentReachable,
    },
  })
}
