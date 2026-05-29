/**
 * iQiyi aggregated search API.
 * Returns show metadata including which platform the show is actually on
 * (siteId: "iqiyi" | "qq" | "youku" | ...) and the Douban ID for matching.
 *
 * Uses system proxy when available (via HTTPS_PROXY/https_proxy env var),
 * otherwise falls back to a direct connection.
 */
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici'
import type { Platform } from '@prisma/client'

// Respect system proxy (e.g. Clash/Surge on local dev) — iQiyi is accessible via proxy
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
const agent = proxyUrl ? new ProxyAgent(proxyUrl) : new Agent()

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.iqiyi.com',
  Accept: 'application/json, */*',
}

// iQiyi siteId → our Platform enum
const SITE_TO_PLATFORM: Record<string, Platform> = {
  iqiyi: 'IQIYI',
  qq: 'TENCENT',
  youku: 'YOUKU',
}

// Fallback platform URLs when we don't have a direct link
function fallbackPlatformUrl(title: string, platform: Platform): string {
  const q = encodeURIComponent(title)
  if (platform === 'IQIYI') return `https://www.iqiyi.com/search.html#query=${q}&channel=5`
  if (platform === 'TENCENT') return `https://v.qq.com/x/search/?q=${q}`
  if (platform === 'YOUKU') return `https://www.youku.com/search?key=${q}`
  return ''
}

export type ShowStatus = 'AIRING' | 'COMPLETED' | 'UPCOMING'

function inferStatus(latestEpisode: number | null, totalEpisodes: number | null): ShowStatus {
  if (latestEpisode === null || latestEpisode === 0) return 'UPCOMING'
  if (totalEpisodes !== null && totalEpisodes > 0 && latestEpisode >= totalEpisodes) return 'COMPLETED'
  return 'AIRING'
}

export interface IqiyiShowInfo {
  doubanId: string | null
  platform: Platform
  platformId: string       // iQiyi albumId (string)
  platformUrl: string
  title: string
  coverImage: string | null
  totalEpisodes: number | null
  latestEpisode: number | null
  description: string | null
  status: ShowStatus
}

export async function searchIqiyiShows(keyword: string, limit = 8): Promise<IqiyiShowInfo[]> {
  // iQiyi API requires spaces encoded as '+' (form encoding), not '%20' (URI encoding)
  const encodedKey = encodeURIComponent(keyword).replace(/%20/g, '+')
  const url =
    `https://search.video.iqiyi.com/o?if=html5` +
    `&key=${encodedKey}` +
    `&pageNum=1&pageSize=${limit}&siteid=&mode=11`
  try {
    const res = await undiciFetch(url, { dispatcher: agent, headers: HEADERS })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docinfos: any[] = json?.data?.docinfos ?? []

    const results: IqiyiShowInfo[] = []

    for (const doc of docinfos) {
      const a = doc.albumDocInfo
      if (!a) continue

      // Only keep serialized long-form content (dramas, variety shows)
      // series falsy = single clip / short video → skip
      // videoDocType 1 = album, 2 = single video
      if (!a.series) continue
      if (a.videoDocType && a.videoDocType !== 1) continue

      const siteId: string = a.siteId ?? ''
      const platform = SITE_TO_PLATFORM[siteId]
      if (!platform) continue  // skip platforms we don't track (mgtv, sohu, etc.)

      const meta = a.video_lib_meta ?? {}
      const doubanId = meta.douban_id ? String(meta.douban_id) : null

      // Cover image — prefer vertical (poster) from iQiyi pic CDN
      // For Tencent shows, albumHImage is from Tencent's CDN (vcover_vt_pic) and
      // contains the cover ID; albumVImage is iQiyi-hosted and doesn't.
      const coverImage: string | null = platform === 'TENCENT'
        ? (a.albumHImage || a.albumImg || a.albumVImage || meta.poster || null)
        : (a.albumVImage || a.albumImg || a.albumHImage || meta.poster || null)

      // For Tencent shows, albumId is often absent — extract cover ID from image URL instead.
      // Image URL format: vcover_vt_pic/0/{coverId}{13-digit-timestamp}/0
      let albumId = a.albumId ? String(a.albumId) : ''
      if (!albumId && platform === 'TENCENT') {
        // Try all image fields in order until we find one with a Tencent CDN URL
        for (const img of [a.albumHImage, a.albumImg, a.albumVImage]) {
          if (!img) continue
          const rawPath = img.match(/vcover_vt_pic\/0\/([a-z0-9]+)/)?.[1] ?? ''
          const candidate = rawPath.replace(/\d{13}$/, '')  // strip 13-digit Unix timestamp
          if (candidate) { albumId = candidate; break }
        }
      }
      if (!albumId) continue  // skip results without any identifiable ID

      // Platform URL: build canonical show page URL per platform
      const rawLink: string = a.albumLink ?? ''
      const isDirectIqiyiUrl = rawLink.includes('iqiyi.com/') && rawLink.includes('/a_')
      const isDirectTencentUrl = rawLink.includes('v.qq.com/x/cover/')
      const isDirectYoukuUrl = rawLink.includes('youku.com/')
      const tencentCoverUrl =
        platform === 'TENCENT' && albumId && !albumId.match(/^\d+$/)
          ? `https://v.qq.com/x/cover/${albumId}.html`
          : null
      // For Youku, prefer the direct albumLink since it encodes the show ID as base64
      const youkuUrl =
        platform === 'YOUKU' && isDirectYoukuUrl
          ? rawLink.replace(/^http:/, 'https:')
          : platform === 'YOUKU' && albumId
            ? `https://v.youku.com/v_nextstage/id_${albumId}.html`
            : null
      const platformUrl = tencentCoverUrl
        ?? youkuUrl
        ?? ((isDirectIqiyiUrl || isDirectTencentUrl || isDirectYoukuUrl)
          ? rawLink.replace(/^http:/, 'https:')
          : fallbackPlatformUrl(a.albumTitle ?? keyword, platform))

      const totalEpisodes = a.itemTotalNumber ? Number(a.itemTotalNumber) : null
      const latestEpisode = a.newest_item_number ? Number(a.newest_item_number) : null

      results.push({
        doubanId,
        platform,
        platformId: albumId,
        platformUrl,
        title: a.albumTitle ?? '',
        coverImage,
        totalEpisodes,
        latestEpisode,
        description: meta.description ?? null,
        status: inferStatus(latestEpisode, totalEpisodes),
      })
    }

    return results
  } catch {
    return []
  }
}

/**
 * Given a Douban subject ID, find the streaming platform info by cross-referencing
 * with the iQiyi aggregated search. Returns null if not found.
 */
export async function resolveShowPlatform(
  title: string,
  doubanId: string,
): Promise<Pick<IqiyiShowInfo, 'platform' | 'platformId' | 'platformUrl' | 'coverImage' | 'totalEpisodes' | 'latestEpisode' | 'description' | 'status'> | null> {
  const results = await searchIqiyiShows(title, 10)

  // First try: exact douban_id match
  const byDouban = results.find((r) => r.doubanId === doubanId)
  if (byDouban) return byDouban

  // Second try: exact title match (some results may not have douban_id)
  const byTitle = results.find(
    (r) => r.title.trim().toLowerCase() === title.trim().toLowerCase(),
  )
  if (byTitle) return byTitle

  return null
}
