/**
 * Tencent Video show tracker.
 *
 * Strategy 0: node.video.qq.com JSON CDN API — not geo-restricted (used by mobile apps)
 * Strategy 1: v.qq.com cover page HTML scrape — geo-blocked on Vercel US
 * Strategy 2: iQiyi aggregated search fallback — works from US but data may be stale
 *             for Tencent competitor shows (iQiyi updates competitor data infrequently)
 */
import axios from 'axios'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'
import { getWetvEpisodeInfo } from '@/lib/scrapers/wetv'

const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: 'https://v.qq.com/',
  },
})

// NOTE on Tencent direct APIs: vlist/ep_list/channel/home all 404 from US
// servers; float_vinfo2 is reachable but has no episode count field; the
// cover-page HTML is geo-blocked. Strategy 0 uses WeTV instead.

export interface TencentEpisodeInfo {
  latestEpisode: number
  totalEpisodes: number | null
  isCompleted: boolean
  coverUrl: string  // clean album cover URL (for DB update)
  updatedAt: Date
}

/**
 * Extract the Tencent cover ID from any v.qq.com URL.
 *   /x/cover/mzc002009g0nh88.html            → mzc002009g0nh88
 *   /x/cover/mzc002009g0nh88/w4102d4f4ur.html → mzc002009g0nh88
 */
function extractCoverId(url: string): string | null {
  return url.match(/\/x\/cover\/([a-z0-9]+)/)?.[1] ?? null
}

/**
 * Scrape episode info and first actor name from the Tencent cover page in one request.
 * Returns null only when the HTTP request itself fails.
 * When the request succeeds but episode patterns are absent, returns episodes:null
 * so the caller can still use firstActor for a narrowed iQiyi fallback search.
 */
async function scrapeFromCoverPage(coverId: string): Promise<{
  episodes: { latestEpisode: number; totalEpisodes: number | null; isCompleted: boolean } | null
  firstActor: string | null
} | null> {
  try {
    const { data } = await http.get(`https://v.qq.com/x/cover/${coverId}.html`)
    const html = data as string

    // Total episodes — dramas use 集, variety shows use 期
    const totalMatch = html.match(/[\/全共](\d+)[集期]/)
    const totalEpisodes = totalMatch ? parseInt(totalMatch[1], 10) : null

    // First actor from JSON-LD (used to narrow iQiyi fallback search)
    let firstActor: string | null = null
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1])
        const graph: { actor?: { name: string }[] }[] = ld['@graph'] ?? [ld]
        for (const item of graph) {
          if (item.actor?.length) { firstActor = item.actor[0].name; break }
        }
      } catch { /* malformed JSON-LD — ignore */ }
    }

    // Airing shows: "更新至34集" / "更新至8期"
    const airingMatch = html.match(/更新至(\d+)[集期]/)
    if (airingMatch) {
      const latestEpisode = parseInt(airingMatch[1], 10)
      const isCompleted =
        html.includes('已完结') ||
        (totalEpisodes !== null && latestEpisode >= totalEpisodes)
      return { episodes: { latestEpisode, totalEpisodes, isCompleted }, firstActor }
    }

    // Completed shows: "全N集/期", 已完结, or 全集
    if (
      totalEpisodes !== null &&
      (html.includes('已完结') || html.includes('全集') || /全\d+期/.test(html))
    ) {
      return {
        episodes: { latestEpisode: totalEpisodes, totalEpisodes, isCompleted: true },
        firstActor,
      }
    }

    return { episodes: null, firstActor }
  } catch {
    return null // HTTP failure
  }
}

/**
 * Get the latest episode count for a Tencent show.
 *
 * Strategy:
 *   1. Scrape cover page HTML for `更新至N集` (fast, real-time)
 *   2. Fall back to iQiyi aggregated search API if page unavailable
 *
 * @param platformUrl - any v.qq.com URL stored for the show
 * @param title       - show title (used as iQiyi search keyword)
 * @param platformId  - stored platformId (iQiyi albumId or Tencent cover ID)
 */
export async function getTencentLatestEpisode(
  platformUrl: string,
  title: string,
  platformId: string,
): Promise<TencentEpisodeInfo | null> {
  const coverId = extractCoverId(platformUrl)
  const coverUrl = coverId
    ? `https://v.qq.com/x/cover/${coverId}.html`
    : platformUrl

  // ── Strategy 0: WeTV (wetv.vip) — Tencent's international platform ───────
  // WeTV is accessible from US servers. Pages display "To EP N / All M EPs".
  const wetv = await getWetvEpisodeInfo(title)
  if (wetv) {
    return {
      latestEpisode: wetv.latestEpisode,
      totalEpisodes: wetv.totalEpisodes,
      isCompleted: wetv.isCompleted,
      coverUrl,
      updatedAt: new Date(),
    }
  }

  // ── Strategy 1: cover page scrape (real-time, geo-blocked on Vercel US) ──
  const scraped = coverId ? await scrapeFromCoverPage(coverId) : null
  if (scraped?.episodes) {
    return { ...scraped.episodes, coverUrl, updatedAt: new Date() }
  }

  // ── Strategy 2: iQiyi aggregated search API (fallback) ──────────────────
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

  const isMatch = (r: { platform: string; platformId: string; title: string; coverImage: string | null }) => {
    if (r.platform !== 'TENCENT') return false
    if (coverId && r.platformId === coverId) return true
    if (coverId && r.coverImage?.includes(coverId)) return true
    if (r.platformId === platformId) return true
    return norm(r.title) === norm(title)
  }

  // Try title-only search first; if no match, retry with actor name (scraped in Strategy 1)
  let results = await searchIqiyiShows(title, 20).catch(() => [])
  let match = results.find(isMatch)

  if (!match && scraped?.firstActor) {
    results = await searchIqiyiShows(`${title} ${scraped.firstActor}`, 10).catch(() => [])
    match = results.find(isMatch)
  }

  if (!match?.latestEpisode) return null

  const total = match.totalEpisodes ?? null
  const isCompleted = total !== null && match.latestEpisode >= total
  return {
    latestEpisode: match.latestEpisode,
    totalEpisodes: total,
    isCompleted,
    coverUrl,
    updatedAt: new Date(),
  }
}
