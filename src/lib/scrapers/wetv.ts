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

/**
 * Search WeTV for a show and return the first matching WeTV cover ID.
 * WeTV URLs look like: /en/play/11itl2izusuiuz6-The_Lead
 */
async function findWetvCoverId(title: string): Promise<string | null> {
  try {
    const url = `https://wetv.vip/en/search?keyword=${encodeURIComponent(title)}`
    const res = await undiciFetch(url, { dispatcher: agent, headers: HEADERS })
    if (!res.ok) return null
    const html = await res.text()

    // Extract cover IDs from /en/play/COVER_ID or /zh-tw/play/COVER_ID patterns.
    // WeTV cover IDs are lowercase alphanumeric, typically 16 chars.
    const re = /\/(?:en|zh-tw|zh-cn)\/play\/([a-z0-9]{10,20})(?:[-?#"']|$)/g
    const ids = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) ids.add(m[1])

    return ids.size > 0 ? [...ids][0] : null
  } catch {
    return null
  }
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
