/**
 * Youku (优酷) show tracker.
 *
 * Youku embeds show metadata inside inline JSON in the static HTML —
 * specifically in a `videoInfo` / `episodeList` section that includes
 * fields like `totalEpisode`, `latestEpisode`, and completion status.
 *
 * URL formats supported:
 *   /v_nextstage/id_<showId>.html   (album / series page — preferred)
 *   /v_show/id_<videoId>.html       (single video — redirects to album page)
 *
 * Fallback: iQiyi aggregated search API (siteId="youku") when the show page
 * is unreachable or the pattern is absent.
 */
import axios from 'axios'
import { searchIqiyiShows } from '@/lib/scraper/iqiyi'

const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: 'https://www.youku.com/',
  },
})

export interface YoukuEpisodeInfo {
  latestEpisode: number
  totalEpisodes: number | null
  isCompleted: boolean
  platformUrl: string // canonical album page URL (for DB update)
  updatedAt: Date
}

/**
 * Extract the Youku show ID from any youku.com URL.
 *   /v_nextstage/id_XMzkyMjU4NDI4NA==.html  → XMzkyMjU4NDI4NA==
 *   /v_show/id_XMzkyMjU4NDI4NA==.html        → XMzkyMjU4NDI4NA==
 */
function extractShowId(url: string): string | null {
  return url.match(/\/id_([^./?#]+)/)?.[1] ?? null
}

/**
 * Build the canonical v_nextstage album page URL from a show ID.
 * Single-video /v_show pages redirect to the album page anyway, so
 * always store the album page URL.
 */
function buildAlbumUrl(showId: string): string {
  return `https://v.youku.com/v_nextstage/id_${showId}.html`
}

/**
 * Scrape latest episode info from the Youku show page HTML.
 *
 * Youku embeds window.__STORE__ / window.__YK_DATA__ JSON in the page, and
 * the episode list area uses Chinese labels similar to Tencent and iQiyi:
 *   "更新至第N集"  /  "更新至N集"  /  "全N集"  /  "全N期"  /  "已完结"
 */
async function scrapeFromShowPage(showId: string): Promise<{
  latestEpisode: number
  totalEpisodes: number | null
  isCompleted: boolean
} | null> {
  try {
    const { data } = await http.get(buildAlbumUrl(showId))
    const html = data as string

    // Total episodes — dramas: 集, variety shows: 期
    const totalMatch = html.match(/[全共](\d+)[集期]/)
    const totalEpisodes = totalMatch ? parseInt(totalMatch[1], 10) : null

    // Airing shows: "更新至第N集" / "更新至N集" / "更新至第N期"
    const airingMatch = html.match(/更新至第?(\d+)[集期]/)
    if (airingMatch) {
      const latestEpisode = parseInt(airingMatch[1], 10)
      const isCompleted =
        html.includes('已完结') ||
        (totalEpisodes !== null && latestEpisode >= totalEpisodes)
      return { latestEpisode, totalEpisodes, isCompleted }
    }

    // Completed shows: "全N集" / "全N期" without any "更新至"
    if (
      totalEpisodes !== null &&
      (html.includes('已完结') || html.includes('全集') || /全\d+[集期]/.test(html))
    ) {
      return { latestEpisode: totalEpisodes, totalEpisodes, isCompleted: true }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get the latest episode count for a Youku show.
 *
 * Strategy:
 *   1. Scrape show page HTML for episode info (fast, real-time)
 *   2. Fall back to iQiyi aggregated search API if page unavailable
 *
 * @param platformUrl - any youku.com URL stored for the show
 * @param title       - show title (used as iQiyi search keyword)
 * @param platformId  - stored platformId (Youku show ID)
 */
export async function getYoukuLatestEpisode(
  storedUrl: string,
  title: string,
  platformId: string,
): Promise<YoukuEpisodeInfo | null> {
  const showId = extractShowId(storedUrl) ?? platformId
  const canonicalUrl = showId ? buildAlbumUrl(showId) : storedUrl

  // ── Strategy 1: show page scrape (real-time, no API quota) ──────────────
  if (showId) {
    const scraped = await scrapeFromShowPage(showId)
    if (scraped) {
      return { ...scraped, platformUrl: canonicalUrl, updatedAt: new Date() }
    }
  }

  // ── Strategy 2: iQiyi aggregated search API (fallback) ──────────────────
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

  const results = await searchIqiyiShows(title, 20).catch(() => [])
  const match = results.find((r) => {
    if (r.platform !== 'YOUKU') return false
    if (showId && r.platformId === showId) return true
    if (r.platformId === platformId) return true
    return norm(r.title) === norm(title)
  })

  if (!match?.latestEpisode) return null

  const total = match.totalEpisodes ?? null
  const isCompleted = total !== null && match.latestEpisode >= total
  return {
    latestEpisode: match.latestEpisode,
    totalEpisodes: total,
    isCompleted,
    platformUrl: canonicalUrl,
    updatedAt: new Date(),
  }
}
