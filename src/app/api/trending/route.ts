/**
 * /api/trending — unified hot-show list for the discover page.
 *
 * Four real-time data sources, all fetched in parallel:
 *
 *  ① Bilibili  pgc/season/index/result
 *              • st=4 order=2  国创 (Chinese animation) ordered by most plays
 *              • st=5 order=0  综艺 / 影视 (drama + variety) ordered by recently updated
 *              Confirmed via API testing: `index_show` lives at top-level (not in new_ep).
 *
 *  ② iQiyi    pcw-api.iqiyi.com/search/recommend/list
 *              channel_id=2 (电视剧) + channel_id=6 (综艺)
 *              Confirmed field names: albumId, name, imageUrl, playUrl, videoCount, latestOrder
 *              Falls back to keyword search ("热播") when pcw-api returns nothing.
 *
 *  ③ Tencent   No reliable JSON API exists. Covered via iQiyi's aggregated search
 *              which includes Tencent (qq siteId) results.
 *
 *  ④ Youku     Scraped from the Youku homepage SSR HTML (window.__INITIAL_DATA__).
 *              moduleList → components → itemList items with action_type="JUMP_TO_SHOW".
 *              lbTexts field provides episode info: "剧・更新至N集" / "综・N期全" etc.
 *              Images on liangcang-material.alicdn.com / m.ykimg.com are publicly accessible.
 *
 * Cached in-memory for 1 hour. Each item carries `dbId` (non-null when the show
 * already exists in our DB) so the frontend can subscribe without a round-trip.
 */
import { NextResponse } from 'next/server'
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import { prisma } from '@/lib/db'
import type { Platform } from '@prisma/client'

// Direct agent for Bilibili (VPN IPs get 412-blocked by their web API)
const directAgent = new Agent()

// Proxy-aware agent for iQiyi (needs system proxy in local dev behind GFW)
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : new Agent()

const COMMON_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface TrendingShow {
  title: string
  coverImage: string | null
  platform: Platform
  platformId: string
  platformUrl: string
  latestEpisode: number | null
  totalEpisodes: number | null
  status: 'AIRING' | 'COMPLETED' | 'UPCOMING'
  dbId: string | null
}

interface CacheEntry {
  data: TrendingShow[]
  ts: number
}

let _cache: CacheEntry | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// ── ① Bilibili: pgc/season/index/result ──────────────────────────────────────
//
// Confirmed ordering params:
//   order=0  上线时间 / 最新更新 (recently updated)
//   order=2  最多播放 (most plays — inflated by daily children's shows with 1000+ eps)
//   order=3  追番人数 (most followers — adult fans track shows; kids don't → best adult bias)
//
// Confirmed: `index_show` is at top-level on each item, NOT inside new_ep.
// Format: "更新至第7集" / "全24集" — extract with regex.

async function fetchBilibiliPgcHot(seasonType: number, order: number): Promise<TrendingShow[]> {
  const params = new URLSearchParams({
    st: String(seasonType),
    season_type: String(seasonType),
    order: String(order),
    is_finish: '0',       // currently airing only
    season_version: '-1',
    copyright: '-1',
    season_status: '-1',
    year: '-1',
    style_id: '-1',
    page: '1',
    pagesize: '10',
    type: '1',
  })

  try {
    const res = await undiciFetch(
      `https://api.bilibili.com/pgc/season/index/result?${params}`,
      {
        dispatcher: directAgent,
        headers: {
          'User-Agent': COMMON_UA,
          Referer: 'https://www.bilibili.com',
          Accept: 'application/json',
        },
      },
    )
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = json?.data?.list ?? []

    return list
      .map((item): TrendingShow | null => {
        const seasonId = String(item.season_id ?? '')
        if (!seasonId || !item.title) return null
        // index_show examples: "更新至第7集" · "更新至第176话" · "全24集" · "昨天22:00更新"
        const indexShow = String(item.index_show ?? '')
        const epMatch = indexShow.match(/更新至第?(\d+)/)
        const latestEpisode = epMatch ? parseInt(epMatch[1], 10) : null
        const totalMatch = indexShow.match(/全(\d+)[集话]/)
        const totalEpisodes = totalMatch ? parseInt(totalMatch[1], 10) : null
        const isCompleted = indexShow.startsWith('全') && !indexShow.includes('更新')
        return {
          title: item.title,
          coverImage: item.cover ?? null,
          platform: 'BILIBILI' as Platform,
          platformId: seasonId,
          platformUrl: item.link ?? `https://www.bilibili.com/bangumi/play/ss${seasonId}`,
          latestEpisode,
          totalEpisodes,
          status: isCompleted ? 'COMPLETED' : 'AIRING',
          dbId: null,
        }
      })
      .filter((s): s is TrendingShow => s !== null)
  } catch {
    return []
  }
}

// ── ② iQiyi: pcw-api channel recommendation list ────────────────────────────
//
// Confirmed response fields (verified by live API test):
//   albumId       — numeric show ID (e.g. 4049834552957001)
//   name          — show title
//   imageUrl      — cover image (iqiyipic.com CDN, proxied by /api/image-proxy)
//   playUrl       — direct play URL (http://www.iqiyi.com/v_XXX.html)
//   videoCount    — total episode count
//   latestOrder   — latest available episode number
//
// channel_id=2: 电视剧  channel_id=6: 综艺

async function fetchIqiyiChannelHot(channelId: number): Promise<TrendingShow[]> {
  try {
    const res = await undiciFetch(
      `https://pcw-api.iqiyi.com/search/recommend/list?channel_id=${channelId}&data_type=1&mode=11&page_id=1&ret_num=30&session=`,
      {
        dispatcher: proxyAgent,
        headers: {
          'User-Agent': COMMON_UA,
          Referer: 'https://www.iqiyi.com',
          Accept: 'application/json',
        },
      },
    )
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = json?.data?.list ?? []

    return list
      .map((item): TrendingShow | null => {
        const albumId = String(item.albumId ?? '')
        const title: string = item.name ?? item.title ?? ''
        if (!albumId || !title) return null

        // playUrl is http — upgrade to https for safety
        const rawUrl: string = item.playUrl ?? ''
        const platformUrl = rawUrl
          ? rawUrl.replace(/^http:/, 'https:')
          : `https://www.iqiyi.com/a_${albumId}.html`

        const latestOrder = item.latestOrder ? Number(item.latestOrder) : null
        const videoCount = item.videoCount ? Number(item.videoCount) : null
        const isCompleted = latestOrder !== null && videoCount !== null && latestOrder >= videoCount

        return {
          title,
          coverImage: item.imageUrl ?? null,
          platform: 'IQIYI' as Platform,
          platformId: albumId,
          platformUrl,
          latestEpisode: latestOrder,
          totalEpisodes: videoCount,
          status: isCompleted ? 'COMPLETED' : 'AIRING',
          dbId: null,
        }
      })
      .filter((s): s is TrendingShow => s !== null)
  } catch {
    return []
  }
}

// Fallback: iQiyi aggregated keyword search (covers both iQiyi + Tencent results)
async function fetchIqiyiSearchHot(): Promise<TrendingShow[]> {
  try {
    const shows = await searchIqiyiShows('热播', 20)
    return shows.map((s): TrendingShow => ({
      title: s.title,
      coverImage: s.coverImage,
      platform: s.platform,
      platformId: s.platformId,
      platformUrl: s.platformUrl,
      latestEpisode: s.latestEpisode,
      totalEpisodes: s.totalEpisodes,
      status: s.status,
      dbId: null,
    }))
  } catch {
    return []
  }
}

// ── ④ Youku: homepage SSR __INITIAL_DATA__ ───────────────────────────────────
//
// Youku homepage SSR-renders show data into window.__INITIAL_DATA__ containing:
//   moduleList[].components[].itemList[]
//     .action_type  "JUMP_TO_SHOW" — the show's hex showId
//     .action_value  hex showId (e.g. "afcb2d65c6a34b798d77")
//     .title         show title
//     .img           cover image (liangcang-material.alicdn.com — publicly accessible)
//     .lbTexts       episode hint: "剧・更新至N集" / "综・N期全" / "漫・更新至N话"
//     .subtitle      hot-chart label: "电视剧热度榜·TOP1" etc.
//
// The JS variable contains `undefined` literals (invalid JSON) — replaced with null.
// Show URL: https://v.youku.com/v_nextstage/id_{showId}.html

async function fetchYoukuHot(): Promise<TrendingShow[]> {
  try {
    const res = await undiciFetch('https://www.youku.com/', {
      dispatcher: proxyAgent,
      headers: {
        'User-Agent': COMMON_UA,
        Referer: 'https://www.youku.com',
        Accept: 'text/html,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    if (!res.ok) return []
    const html = await res.text()

    // Extract window.__INITIAL_DATA__ = { ... }
    const markerRe = /window\.__INITIAL_DATA__\s*=\s*/
    const mIdx = markerRe.exec(html)
    if (!mIdx) return []
    const rawJs = html.slice(mIdx.index + mIdx[0].length)

    // Balanced-brace extraction (the object may be very large)
    let depth = 0
    let end = 0
    for (let i = 0; i < rawJs.length; i++) {
      if (rawJs[i] === '{') depth++
      else if (rawJs[i] === '}') {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }
    if (!end) return []
    // Replace JS `undefined` with JSON `null`
    const jsonStr = rawJs.slice(0, end).replace(/\bundefined\b/g, 'null')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(jsonStr) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modules: any[] = data.moduleList ?? []

    const shows: TrendingShow[] = []
    const seen = new Set<string>()

    for (const mod of modules) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const comp of (mod.components ?? []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of (comp.itemList ?? []) as any[]) {
          if (item.action_type !== 'JUMP_TO_SHOW') continue
          const showId: string = item.action_value ?? ''
          const title: string = item.title ?? ''
          if (!showId || !title) continue
          // Skip IDs that look like UTF-8 replacement (corrupted encoding)
          if (showId.includes('efbfbd')) continue
          if (seen.has(showId)) continue

          // lbTexts format: "剧・..." / "综・..." / "漫・..." / "影・..." / "纪・..."
          // Keep only dramas (剧) and variety shows (综).
          // Skip animation (漫) — Bilibili's 国创 (order=3/followers) is a better source for
          // adult animation and naturally excludes children's shows. Youku's 漫 category
          // mixes adult animation with children's educational content that's hard to distinguish.
          // Skip movies (影) and documentaries (纪) — not relevant to the drama/variety audience.
          const lb: string = item.lbTexts ?? ''
          const typePrefix = lb.split('・')[0]
          if (!['剧', '综'].includes(typePrefix)) continue

          seen.add(showId)

          // Parse episode info from the episode-hint part (after ・)
          // e.g. "更新至47集" / "28集全" / "更新至1260话" / "12期全" / "限免12-14集"
          const epPart = lb.split('・')[1] ?? ''
          const airingMatch = epPart.match(/更新至(\d+)[集话期]/)
          const completedMatch = epPart.match(/(\d+)[集话期]全/)
          const latestEpisode = airingMatch
            ? parseInt(airingMatch[1], 10)
            : completedMatch
              ? parseInt(completedMatch[1], 10)
              : null
          const totalEpisodes = completedMatch ? parseInt(completedMatch[1], 10) : null
          const isCompleted = !!completedMatch

          shows.push({
            title,
            coverImage: (item.img ?? item.hImg ?? null) as string | null,
            platform: 'YOUKU' as Platform,
            platformId: showId,
            platformUrl: `https://v.youku.com/v_nextstage/id_${showId}.html`,
            latestEpisode,
            totalEpisodes,
            status: isCompleted ? 'COMPLETED' : 'AIRING',
            dbId: null,
          })
        }
      }
    }

    return shows
  } catch {
    return []
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data)
  }

  // All fetches in parallel — individual failures return [] gracefully
  const [biliAnimation, biliDrama, iqiyiDrama, iqiyiVariety, iqiyiSearch, youkuDirect] =
    await Promise.all([
      fetchBilibiliPgcHot(4, 3),  // 国创 (Chinese animation) — by most followers (adults track shows, kids don't)
      fetchBilibiliPgcHot(5, 0),  // 综艺/影视 (drama + variety) — by recently updated
      fetchIqiyiChannelHot(2),    // iQiyi 电视剧 channel
      fetchIqiyiChannelHot(6),    // iQiyi 综艺 channel
      fetchIqiyiSearchHot(),       // iQiyi+Tencent via keyword search (Tencent fallback)
      fetchYoukuHot(),             // Youku homepage SSR hot list (direct)
    ])

  // Use pcw-api results for iQiyi if they returned content.
  // Tencent is always sourced from iQiyi aggregated search (iQiyi indexes Tencent content).
  // Youku uses direct homepage scraping; falls back to iQiyi search if homepage unavailable.
  const iqiyiPcw = [...iqiyiDrama, ...iqiyiVariety]
  const iqiyiShows = iqiyiPcw.length > 0
    ? iqiyiPcw
    : iqiyiSearch.filter((s) => s.platform === 'IQIYI')
  const tencentShows = iqiyiSearch.filter((s) => s.platform === 'TENCENT')
  const youkuShows = youkuDirect.length > 0
    ? youkuDirect
    : iqiyiSearch.filter((s) => s.platform === 'YOUKU')
  const biliShows = [...biliAnimation, ...biliDrama]

  // Round-robin interleave to balance platforms across the grid
  const seenTitles = new Set<string>()
  const seenIds = new Set<string>()
  const combined: TrendingShow[] = []

  function tryAdd(show: TrendingShow) {
    const titleKey = show.title.toLowerCase().replace(/\s+/g, '')
    const idKey = `${show.platform}:${show.platformId}`
    if (seenTitles.has(titleKey) || seenIds.has(idKey)) return
    // Skip high-frequency daily shows (>300 episodes = almost exclusively children's animation
    // aired every weekday; keeps adult serials like 凡人修仙传 at 176 eps)
    const epCount = show.latestEpisode ?? show.totalEpisodes ?? null
    if (epCount !== null && epCount > 300) return
    seenTitles.add(titleKey)
    seenIds.add(idKey)
    combined.push(show)
  }

  const maxLen = Math.max(biliShows.length, iqiyiShows.length, tencentShows.length, youkuShows.length)
  for (let i = 0; i < maxLen; i++) {
    if (biliShows[i]) tryAdd(biliShows[i])
    if (iqiyiShows[i]) tryAdd(iqiyiShows[i])
    if (tencentShows[i]) tryAdd(tencentShows[i])
    if (youkuShows[i]) tryAdd(youkuShows[i])
  }

  const top30 = combined.slice(0, 30)

  // Cross-reference with DB — find shows already tracked by someone
  if (top30.length > 0) {
    const platformIds = top30.map((s) => s.platformId)
    const titles = top30.map((s) => s.title)

    const dbShows = await prisma.show.findMany({
      where: {
        OR: [{ platformId: { in: platformIds } }, { title: { in: titles } }],
      },
      select: { id: true, platformId: true, title: true },
    })

    const byPlatformId = new Map(dbShows.map((s) => [s.platformId, s.id]))
    const byTitle = new Map(dbShows.map((s) => [s.title.toLowerCase().replace(/\s+/g, ''), s.id]))

    for (const show of top30) {
      show.dbId =
        byPlatformId.get(show.platformId) ??
        byTitle.get(show.title.toLowerCase().replace(/\s+/g, '')) ??
        null
    }
  }

  _cache = { data: top30, ts: Date.now() }
  return NextResponse.json(top30)
}
