import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliShows, searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import axios from 'axios'

export const dynamic = 'force-dynamic'

/** Quick test of the Tencent CDN JSON API for 主角 */
async function testTencentCdnApi() {
  const coverId = 'mzc002009g0nh88' // 主角
  try {
    const { data } = await axios.get('https://node.video.qq.com/x/api/float_vinfo2', {
      params: { cid: coverId, ep_id: '', refer: 'mobile' },
      timeout: 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        Referer: 'https://m.v.qq.com/',
        Accept: 'application/json, */*',
      },
    })
    const vinfo = data?.data?.vinfo ?? data?.vinfo
    const epCntA = vinfo?.ep?.cnt ?? vinfo?.ep_num ?? vinfo?.vc_num ?? vinfo?.cover?.item_count
    // Shape B: c object
    const c = data?.c
    const videoIds: string[] = Array.isArray(c?.video_ids) ? c.video_ids : []
    const clipsIds: string[] = Array.isArray(c?.clips_ids) ? c.clips_ids : []
    const episodeIds = videoIds.filter((id: string) => !clipsIds.includes(id))
    const epCntB_raw = videoIds.length
    const epCntB_minus_clips = episodeIds.length
    const downright: string[] = Array.isArray(c?.downright) ? c.downright : []
    const downrightMax = downright.length > 0
      ? Math.max(...downright.map((n: string) => parseInt(n, 10)).filter((n: number) => !isNaN(n)))
      : null
    const epCnt = epCntA ?? (epCntB_minus_clips > 0 ? epCntB_minus_clips : null)
    return {
      ok: true,
      ret: data?.ret,
      epCnt,
      video_ids_total: epCntB_raw,
      clips_ids_count: clipsIds.length,
      episodes_after_subtracting_clips: epCntB_minus_clips,
      downright_max: downrightMax,
      downright_count: downright.length,
      cKeys: c ? Object.keys(c) : null,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET() {
  // 1. Test DB write-then-read
  let dbWriteOk = false
  let dbWriteError = ''
  let testId = ''
  try {
    const created = await prisma.celebrity.create({
      data: { name: '__debug_test__' },
    })
    testId = created.id
    const found = await prisma.celebrity.findUnique({ where: { id: testId } })
    dbWriteOk = found?.id === testId
    // Clean up
    await prisma.celebrity.delete({ where: { id: testId } }).catch(() => {})
  } catch (e) {
    dbWriteError = e instanceof Error ? e.message : String(e)
  }

  // 2. DB counts
  const [showCount, celebCount, subCount, showUpdateCount] = await Promise.all([
    prisma.show.count(),
    prisma.celebrity.count(),
    prisma.subscription.count(),
    prisma.showUpdate.count(),
  ])

  // 3. Test external scrapers + Tencent CDN API in parallel
  const [biliShows, biliUsers, doubanCelebs, iqiyiMain, tencentCdn] = await Promise.allSettled([
    searchBilibiliShows('三体'),
    searchBilibiliUsers('刘浩存'),
    searchDoubanCelebrities('刘浩存'),
    // iQiyi aggregated data for 主角 (Tencent show) — stale if newest_item_number < 40
    searchIqiyiShows('主角', 50).then((results) => {
      const match = results.find(
        (r) => r.platform === 'TENCENT' && r.title.replace(/\s+/g, '') === '主角',
      )
      return match
        ? { found: true, latestEpisode: match.latestEpisode, totalEpisodes: match.totalEpisodes }
        : { found: false, totalResults: results.length }
    }),
    testTencentCdnApi(),
  ])

  const dbHost = (process.env.DATABASE_URL ?? '')
    .replace(/:\/\/[^@]+@/, '://***@')
    .split('/')[2] ?? 'unknown'

  return NextResponse.json({
    db: {
      host: dbHost,
      writeReadOk: dbWriteOk,
      error: dbWriteError || null,
      counts: { shows: showCount, celebrities: celebCount, subscriptions: subCount, showUpdates: showUpdateCount },
    },
    scrapers: {
      bilibiliShows:
        biliShows.status === 'fulfilled'
          ? `${biliShows.value.length} results`
          : `error: ${(biliShows as PromiseRejectedResult).reason}`,
      bilibiliUsers:
        biliUsers.status === 'fulfilled'
          ? biliUsers.value.map((u) => u.name)
          : `error: ${(biliUsers as PromiseRejectedResult).reason}`,
      douban:
        doubanCelebs.status === 'fulfilled'
          ? doubanCelebs.value.map((c) => c.name)
          : `error: ${(doubanCelebs as PromiseRejectedResult).reason}`,
      iqiyi_zhuJue:
        iqiyiMain.status === 'fulfilled'
          ? iqiyiMain.value
          : `error: ${(iqiyiMain as PromiseRejectedResult).reason}`,
      tencent_cdn_api:
        tencentCdn.status === 'fulfilled'
          ? tencentCdn.value
          : `error: ${(tencentCdn as PromiseRejectedResult).reason}`,
    },
  })
}
