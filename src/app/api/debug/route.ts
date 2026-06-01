import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliShows, searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import axios from 'axios'

export const dynamic = 'force-dynamic'

/** Test the Tencent vlist API (type=0 = 正片 only) for 主角 */
async function testTencentVlistApi() {
  const coverId = 'mzc002009g0nh88' // 主角
  try {
    const { data } = await axios.get('https://node.video.qq.com/x/api/vlist', {
      params: { id: coverId, type: 0, page: 0, pagesize: 100 },
      timeout: 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        Referer: 'https://m.v.qq.com/',
        Accept: 'application/json, */*',
      },
    })

    const vlist: { title?: string }[] = Array.isArray(data?.vlist) ? data.vlist : []
    const epNums = vlist
      .map((ep) => {
        const m = String(ep.title ?? '').match(/(\d+)/)
        return m ? parseInt(m[1], 10) : NaN
      })
      .filter((n) => !isNaN(n) && n > 0)

    return {
      ok: true,
      vlist_count: vlist.length,
      ep_nums_found: epNums.length,
      max_ep: epNums.length > 0 ? Math.max(...epNums) : null,
      total_in_response: data?.total ?? data?.count ?? null,
      is_end: data?.is_end ?? null,
      outerKeys: data ? Object.keys(data) : null,
      first3_titles: vlist.slice(0, 3).map((ep) => ep.title),
      last3_titles: vlist.slice(-3).map((ep) => ep.title),
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
    testTencentVlistApi(),
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
      tencent_vlist_api:
        tencentCdn.status === 'fulfilled'
          ? tencentCdn.value
          : `error: ${(tencentCdn as PromiseRejectedResult).reason}`,
    },
  })
}
