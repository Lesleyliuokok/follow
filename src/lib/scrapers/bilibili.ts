/**
 * Bilibili scrapers for the cron jobs.
 * Uses a direct undici Agent to bypass the global VPN proxy dispatcher.
 */
import { Agent, fetch as undiciFetch } from 'undici'

const directAgent = new Agent()

const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com',
  Accept: 'application/json, */*',
}

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 BiliDroid/6.27.0 (bbcallen@gmail.com)',
  Accept: 'application/json, */*',
}

// ---------------------------------------------------------------------------
// Show / episode checking
// ---------------------------------------------------------------------------

export interface BilibiliEpisode {
  ep_id: number
  title: string       // episode number as string e.g. "15"
  long_title: string  // episode subtitle
  pub_time: number    // unix timestamp
  cover: string
}

export interface BilibiliSeasonInfo {
  season_id: string
  title: string
  cover: string
  is_finish: number   // 1 = completed
  episodes: BilibiliEpisode[]
}

/**
 * Fetch all episode info for a Bilibili bangumi by season_id.
 * season_id is the number in the URL: bilibili.com/bangumi/play/ss26257 → "26257"
 */
export async function getBilibiliSeason(seasonId: string): Promise<BilibiliSeasonInfo | null> {
  const url = `https://api.bilibili.com/pgc/view/web/season?season_id=${seasonId}`
  try {
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: WEB_HEADERS })
    if (!res.ok) return null
    const text = await res.text()
    if (!text.trimStart().startsWith('{')) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(text) as any
    if (json.code !== 0) return null
    const r = json.result
    return {
      season_id: seasonId,
      title: r.title ?? '',
      cover: r.cover ?? '',
      is_finish: r.is_finish ?? 0,
      episodes: (r.episodes ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ep: any): BilibiliEpisode => ({
          ep_id: ep.ep_id ?? ep.id ?? 0,
          title: String(ep.title ?? ''),
          long_title: String(ep.long_title ?? ''),
          pub_time: Number(ep.pub_time ?? 0),
          cover: String(ep.cover ?? ''),
        }),
      ),
    }
  } catch {
    return null
  }
}

/**
 * Get the latest episode of a Bilibili show.
 * Pass the season_id (extracted from platformUrl: .../ss26257 → "26257").
 */
export async function getLatestBilibiliEpisode(seasonId: string) {
  const season = await getBilibiliSeason(seasonId)
  if (!season || season.episodes.length === 0) return null
  const latest = season.episodes[season.episodes.length - 1]
  return { season, episode: latest }
}

// ---------------------------------------------------------------------------
// User dynamics (social posts)
// ---------------------------------------------------------------------------

export interface BilibiliPost {
  id: string
  content: string
  mediaUrls: string[]
  postUrl: string
  publishedAt: Date
}

/**
 * Fetch recent dynamics for a Bilibili user (mid).
 * Uses cookie if BILIBILI_COOKIE is set; otherwise may get limited results.
 */
export async function getBilibiliUserPosts(uid: string, limit = 10): Promise<BilibiliPost[]> {
  const cookie = process.env.BILIBILI_COOKIE ?? ''
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${uid}&features=itemOpusStyle`
  try {
    const res = await undiciFetch(url, {
      dispatcher: directAgent,
      headers: {
        ...WEB_HEADERS,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    })
    if (!res.ok) return []
    const text = await res.text()
    if (!text.trimStart().startsWith('{')) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(text) as any
    if (json.code !== 0) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json.data?.items ?? []).slice(0, limit).map((item: any): BilibiliPost => {
      const modules = item.modules ?? {}
      const dynDesc = modules.module_dynamic?.desc
      const content = dynDesc?.text ?? ''
      const pubTs = modules.module_author?.pub_ts ?? 0
      // collect image urls from major module
      const major = modules.module_dynamic?.major
      const draw = major?.draw?.items ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mediaUrls: string[] = draw.map((d: any) => d.src).filter(Boolean)

      return {
        id: String(item.id_str ?? item.id ?? ''),
        content,
        mediaUrls,
        postUrl: `https://www.bilibili.com/opus/${item.id_str ?? item.id}`,
        publishedAt: new Date(pubTs * 1000),
      }
    })
  } catch {
    return []
  }
}

// Keep mobile headers available for future use
export { MOBILE_HEADERS }
