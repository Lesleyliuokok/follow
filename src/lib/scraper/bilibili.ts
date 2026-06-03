/**
 * Bilibili search via the Android mobile API — no cookies or wbi signature required,
 * and uses a direct undici Agent to bypass the global VPN proxy dispatcher
 * (the VPN IP gets 412-blocked by Bilibili's web API; direct China IP works fine).
 */
import { Agent, fetch as undiciFetch } from 'undici'

const directAgent = new Agent()

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 BiliDroid/6.27.0 (bbcallen@gmail.com)',
  'Accept-Language': 'zh-CN',
}

type ShowStatus = 'AIRING' | 'COMPLETED' | 'UPCOMING'

export interface BiliShow {
  platformId: string   // media_id (param field)
  seasonId: string     // season_id
  title: string
  coverImage: string | null
  platformUrl: string
  latestEpisode: number | null
  status: ShowStatus
}

export interface BiliUser {
  platformId: string   // mid (param field)
  name: string
  avatar: string | null
  followersCount: number | null
}

function cleanUrl(uri: string): string {
  try {
    const u = new URL(uri)
    // Keep only the path
    return `${u.protocol}//${u.hostname}${u.pathname}`
  } catch {
    return uri
  }
}

// Find the highest numeric episode index from episodes_new array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function latestEpFromList(episodes: any[]): number | null {
  if (!Array.isArray(episodes)) return null
  const nums = episodes
    .map((e) => parseInt(e.title ?? '', 10))
    .filter((n) => !isNaN(n))
  return nums.length > 0 ? Math.max(...nums) : null
}

/** Strip HTML tags that Bilibili search sometimes injects for keyword highlighting */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

export async function searchBilibiliShows(keyword: string): Promise<BiliShow[]> {
  const url =
    `https://app.bilibili.com/x/v2/search` +
    `?keyword=${encodeURIComponent(keyword)}&mobi_app=android&build=6270200&page=1`

  try {
    const res = await undiciFetch(url, {
      dispatcher: directAgent,
      headers: MOBILE_HEADERS,
    })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    if (json.code !== 0) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(json.data?.item) ? json.data.item : []

    return items
      // bangumi = Japanese anime / Chinese animation
      // ogv     = licensed foreign & domestic live-action drama (e.g. British dramas, K-dramas)
      .filter((it) => it.goto === 'bangumi' || it.goto === 'ogv')
      .slice(0, 10)
      .map((it): BiliShow => {
        const seasonId = String(it.season_id ?? it.param ?? '')
        const latestEpisode = latestEpFromList(it.episodes_new)
        return {
          platformId: String(it.param ?? it.season_id ?? ''),
          seasonId,
          title: stripHtml(it.title ?? ''),
          coverImage: it.cover ?? null,
          platformUrl: seasonId
            ? `https://www.bilibili.com/bangumi/play/ss${seasonId}`
            : cleanUrl(it.uri ?? ''),
          latestEpisode,
          status: 'AIRING',  // mobile API doesn't expose is_finish; update later via cron
        }
      })
      .filter((it) => it.platformId && it.seasonId)  // skip malformed entries
  } catch {
    return []
  }
}

export async function searchBilibiliUsers(keyword: string): Promise<BiliUser[]> {
  const url =
    `https://app.bilibili.com/x/v2/search` +
    `?keyword=${encodeURIComponent(keyword)}&mobi_app=android&build=6270200&page=1`

  try {
    const res = await undiciFetch(url, {
      dispatcher: directAgent,
      headers: MOBILE_HEADERS,
    })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    if (json.code !== 0) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(json.data?.item) ? json.data.item : []

    // Fan-account name patterns to exclude
    const FAN_KEYWORDS = /粉丝|超粉|后援|应援|视频站|资讯站|应援站|吧|的家|工作室$|fans$/i

    return items
      .filter((it) => it.goto === 'author')
      // Only include: official/verified accounts OR accounts with ≥100k followers
      // official_verify.type: -1=none, 0=personal, 1=org; 127=unset
      .filter((it) => {
        const verifyType: number = it.official_verify?.type ?? 127
        const fans: number = it.fans ?? 0
        const name: string = it.title ?? ''
        if (FAN_KEYWORDS.test(name)) return false      // exclude obvious fan accounts
        if (verifyType === 0 || verifyType === 1) return true  // verified individual / org
        if (fans >= 100_000) return true               // high-follower unverified creator
        return false
      })
      .slice(0, 5)
      .map((it): BiliUser => ({
        platformId: String(it.param),
        name: it.title ?? '',
        avatar: it.cover ?? null,
        followersCount: it.fans ?? null,
      }))
  } catch {
    return []
  }
}
