/**
 * Weibo scrapers — requires WEIBO_COOKIE in .env for authenticated endpoints.
 * Cookie: log in to weibo.com → DevTools → any XHR request → copy Cookie header.
 */
import { Agent, fetch as undiciFetch } from 'undici'

const directAgent = new Agent()

function headers() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://weibo.com/',
    Cookie: process.env.WEIBO_COOKIE ?? '',
  }
}

export interface WeiboPost {
  id: string
  content: string
  mediaUrls: string[]
  postUrl: string
  publishedAt: Date
}

export interface WeiboUserInfo {
  uid: string
  name: string
  avatar: string | null
  profileUrl: string
  description: string | null
  followersCount: number | null
}

// ---------------------------------------------------------------------------
// Parse a Weibo profile URL → UID or custom username
// Supports: weibo.com/u/1234567  weibo.com/customname  weibo.com/p/1005051234567
// ---------------------------------------------------------------------------
export function parseWeiboUrl(input: string): { type: 'uid'; uid: string } | { type: 'custom'; custom: string } | null {
  const cleaned = input.trim().replace(/\/$/, '')
  // Try direct UID: /u/123... or just numeric
  const uidMatch = cleaned.match(/(?:weibo\.com\/u\/|^)(\d{7,12})$/)
  if (uidMatch) return { type: 'uid', uid: uidMatch[1] }
  // /p/100505XXXXXXX format
  const pMatch = cleaned.match(/weibo\.com\/p\/100505(\d+)/)
  if (pMatch) return { type: 'uid', uid: pMatch[1] }
  // Custom username
  const customMatch = cleaned.match(/weibo\.com\/([a-zA-Z0-9_一-龥]+)$/)
  if (customMatch && customMatch[1] !== 'u') return { type: 'custom', custom: customMatch[1] }
  return null
}

// ---------------------------------------------------------------------------
// Resolve custom username → UID via profile/info API (needs cookie)
// NOTE: Weibo custom usernames are NOT unique (anyone can claim them),
// so this is unreliable for finding a specific celebrity.
// Prefer having users supply /u/UID format URLs.
// ---------------------------------------------------------------------------
export async function resolveWeiboUsername(custom: string): Promise<string | null> {
  try {
    const url = `https://weibo.com/ajax/profile/info?custom=${encodeURIComponent(custom)}`
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: headers() })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    const user = json?.data?.user
    if (!user?.id) return null
    return String(user.id)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fetch Weibo user profile by UID
// ---------------------------------------------------------------------------
export async function getWeiboUserInfo(uid: string): Promise<WeiboUserInfo | null> {
  try {
    // profile/info returns user object with uid, name, avatar, followers
    const url = `https://weibo.com/ajax/profile/info?uid=${uid}`
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: headers() })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    const user = json?.data?.user
    if (!user?.id) return null
    return {
      uid: String(user.id),
      name: String(user.screen_name ?? ''),
      avatar: user.avatar_hd ?? user.profile_image_url ?? null,
      profileUrl: `https://weibo.com/u/${user.id}`,
      description: user.description ?? null,
      followersCount: user.followers_count ?? null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Search Weibo users by keyword (needs cookie)
// ---------------------------------------------------------------------------
export interface WeiboSearchUser {
  uid: string
  name: string
  avatar: string | null
  profileUrl: string
  description: string | null
}

export async function searchWeiboUsers(keyword: string, limit = 5): Promise<WeiboSearchUser[]> {
  try {
    const url = `https://weibo.com/ajax/search/users?q=${encodeURIComponent(keyword)}&page=1`
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: headers() })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    const users: unknown[] = json?.data?.users ?? json?.users ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return users.slice(0, limit).map((u: any): WeiboSearchUser => ({
      uid: String(u.id ?? ''),
      name: String(u.screen_name ?? ''),
      avatar: u.avatar_hd ?? u.profile_image_url ?? null,
      profileUrl: `https://weibo.com/u/${u.id}`,
      description: u.description ?? null,
    })).filter((u) => u.uid)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Fetch recent posts for a Weibo user by UID
// ---------------------------------------------------------------------------
export async function getWeiboUserPosts(uid: string, limit = 10): Promise<WeiboPost[]> {
  try {
    const url = `https://weibo.com/ajax/statuses/mymblog?uid=${uid}&page=1&feature=0`
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: headers() })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    const posts: unknown[] = json?.data?.list ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return posts.slice(0, limit).map((p: any): WeiboPost => {
      const pics: string[] = p.pic_ids ?? []
      const picInfos: Record<string, Record<string, unknown>> = p.pic_infos ?? {}
      return {
        id: String(p.id ?? p.idstr ?? ''),
        content: String(p.text_raw ?? p.text ?? ''),
        mediaUrls: pics
          .map((pid) => String((picInfos[pid]?.original as Record<string, unknown>)?.url ?? ''))
          .filter(Boolean),
        postUrl: `https://weibo.com/${uid}/${p.mblogid}`,
        publishedAt: new Date(String(p.created_at ?? '')),
      }
    }).filter((p) => p.id)
  } catch {
    return []
  }
}
