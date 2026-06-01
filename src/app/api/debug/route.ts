import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchBilibiliShows, searchBilibiliUsers } from '@/lib/scraper/bilibili'
import { searchDoubanCelebrities } from '@/lib/scraper/douban'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import axios from 'axios'

export const dynamic = 'force-dynamic'

const TENCENT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  Referer: 'https://m.v.qq.com/',
  Accept: 'application/json, */*',
}

/** Try one URL, return { ok, status/error, keys, sample } */
async function tryUrl(url: string, params?: Record<string, unknown>) {
  try {
    const { data, status } = await axios.get(url, { params, timeout: 8000, headers: TENCENT_HEADERS })
    return {
      ok: true,
      status,
      keys: data && typeof data === 'object' ? Object.keys(data) : null,
      sample: JSON.stringify(data).slice(0, 200),
    }
  } catch (e: unknown) {
    const ae = e as { response?: { status: number }; message?: string }
    return { ok: false, status: ae.response?.status ?? null, error: ae.message ?? String(e) }
  }
}

/** Test multiple Tencent endpoints for 主角 */
async function testTencentVlistApi() {
  const coverId = 'mzc002009g0nh88'

  // First: get column_id from float_vinfo2
  let columnId: string | null = null
  try {
    const { data } = await axios.get('https://node.video.qq.com/x/api/float_vinfo2',
      { params: { cid: coverId, ep_id: '', refer: 'mobile' }, timeout: 6000, headers: TENCENT_HEADERS })
    columnId = data?.c?.column_id ?? null
  } catch { /* ignore */ }

  // Try multiple endpoint candidates in parallel
  const [r1, r2, r3, r4] = await Promise.all([
    // v.qq.com API (not HTML page — may not be geo-blocked)
    tryUrl('https://v.qq.com/x/api/vlist.html', { id: coverId, type: 0, page: 0 }),
    // channel home API
    tryUrl('https://v.qq.com/api/v3/channel/home', { id: coverId, num: 30, page: 0, isHalf: 0 }),
    // vlist with column_id (if available)
    columnId
      ? tryUrl('https://node.video.qq.com/x/api/vlist', { cid: columnId, type: 0, page: 0, num: 50 })
      : Promise.resolve({ ok: false, status: null, error: 'no column_id' }),
    // Alternate node endpoint
    tryUrl('https://node.video.qq.com/x/api/ep_list', { cid: coverId, type: 0, page: 0 }),
  ])

  return {
    column_id: columnId,
    'v.qq.com/x/api/vlist.html': r1,
    'v.qq.com/api/v3/channel/home': r2,
    'node/vlist?cid=column_id': r3,
    'node/ep_list': r4,
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
