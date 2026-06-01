/**
 * WeTV (wetv.vip) scraper — Tencent Video's international platform.
 *
 * WeTV is accessible from US servers (unlike v.qq.com which is geo-blocked).
 * Show pages display real-time episode counts: "To EP 40 / All 48 EPs".
 * WeTV uses different cover IDs from Tencent Video, so we search by title first.
 */
import { Agent, fetch as undiciFetch } from 'undici'

const agent = new Agent()

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
}

export interface WetvEpisodeInfo {
  latestEpisode: number
  totalEpisodes: number | null
  isCompleted: boolean
  wetvCoverId: string
}

/** Fetch a URL and return the HTML, or null on error */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await undiciFetch(url, { dispatcher: agent, headers: HEADERS })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** Extract the show title from a WeTV page (og:title or <title> tag) */
function extractPageTitle(html: string): string {
  return (
    html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ??
    html.match(/content="([^"]+)"\s+property="og:title"/)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    ''
  )
}

/**
 * Search WeTV for a show and return the best-matching WeTV cover ID.
 *
 * Searches wetv.vip/en/search, extracts all cover-ID candidates, then
 * fetches each show page (up to 5) and compares the page title against
 * the expected title to reject wrong matches.
 */
async function findWetvCoverId(title: string): Promise<string | null> {
  const searchHtml = await fetchHtml(
    `https://wetv.vip/en/search?keyword=${encodeURIComponent(title)}`,
  )
  if (!searchHtml) return null

  // Collect unique cover IDs from /en/play/COVER_ID or /zh-tw/play/COVER_ID patterns
  const re = /\/(?:en|zh-tw|zh-cn)\/play\/([a-z0-9]{10,20})(?:[-?#"'\s]|$)/g
  const ids: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(searchHtml)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1])
  }
  if (ids.length === 0) return null

  // Normalize expected title for comparison (handles spaces, case, CJK)
  const norm = (s: string) => s.toLowerCase().replace(/[\s　]/g, '')
  const normTitle = norm(title)

  // Fetch each candidate page and verify the title matches
  for (const id of ids.slice(0, 5)) {
    const pageHtml = await fetchHtml(`https://wetv.vip/en/play/${id}`)
    if (!pageHtml) continue

    const pageTitle = norm(extractPageTitle(pageHtml))
    // Accept if page title contains our query title, or vice-versa
    if (pageTitle.includes(normTitle) || normTitle.includes(pageTitle.split(/[-|]/)[0])) {
      console.log(`[wetv] matched "${title}" → cover ${id} (page title: "${extractPageTitle(pageHtml)}")`)
      return id
    }
  }

  console.log(`[wetv] no title match found for "${title}" among ${ids.length} candidates`)
  return null
}

/**
 * Parse episode counts from WeTV show page HTML.
 * Handles both English and CJK patterns displayed on the page.
 */
function parseEpisodeCounts(html: string): { latestEpisode: number; totalEpisodes: number | null; isCompleted: boolean } | null {
  // English: "To EP 40" / "All 48 EPs" / "Ended"
  const toEpEn = html.match(/To EP\s*(\d+)/i)
  const allEpsEn = html.match(/All\s*(\d+)\s*EPs?/i)
  const endedEn = /\bEnded\b|\bCompleted\b/i.test(html)

  // Chinese (Traditional / Simplified): "更新到第40集" "更新至40集" "全48集" "已完结"
  const toEpZh = html.match(/更新(?:到|至)第?(\d+)集/)
  const allEpsZh = html.match(/全(\d+)[集期]/)
  const endedZh = /已完结|已完播/.test(html)

  // Prefer English patterns (they're clearer in WeTV's international UI)
  const latestRaw = toEpEn?.[1] ?? toEpZh?.[1]
  const totalRaw = allEpsEn?.[1] ?? allEpsZh?.[1]
  const isCompleted = endedEn || endedZh || !!(totalRaw && latestRaw && parseInt(latestRaw, 10) >= parseInt(totalRaw, 10))

  if (!latestRaw && !totalRaw) return null

  const latestEpisode = latestRaw ? parseInt(latestRaw, 10) : parseInt(totalRaw!, 10)
  const totalEpisodes = totalRaw ? parseInt(totalRaw, 10) : null

  return { latestEpisode, totalEpisodes, isCompleted }
}

/**
 * Get episode info for a Tencent show via WeTV (international platform).
 * Steps:
 *   1. Search WeTV by title → get WeTV cover ID
 *   2. Fetch show page → parse episode counts
 *
 * Returns null if the show isn't on WeTV or if data can't be parsed.
 */
export async function getWetvEpisodeInfo(title: string): Promise<WetvEpisodeInfo | null> {
  const wetvCoverId = await findWetvCoverId(title)
  if (!wetvCoverId) {
    console.log(`[wetv] "${title}": not found in search`)
    return null
  }

  try {
    const url = `https://wetv.vip/en/play/${wetvCoverId}`
    const res = await undiciFetch(url, { dispatcher: agent, headers: HEADERS })
    if (!res.ok) {
      console.log(`[wetv] "${title}" (${wetvCoverId}): page returned ${res.status}`)
      return null
    }
    const html = await res.text()
    const counts = parseEpisodeCounts(html)
    if (!counts) {
      console.log(`[wetv] "${title}" (${wetvCoverId}): no episode count found in page`)
      return null
    }

    console.log(
      `[wetv] "${title}" (${wetvCoverId}): ep${counts.latestEpisode}/${counts.totalEpisodes ?? '?'} completed=${counts.isCompleted}`,
    )
    return { ...counts, wetvCoverId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`[wetv] "${title}" (${wetvCoverId}): fetch failed (${msg.slice(0, 80)})`)
    return null
  }
}
