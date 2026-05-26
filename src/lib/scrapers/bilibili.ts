import axios from 'axios'

const api = axios.create({
  baseURL: 'https://api.bilibili.com',
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  timeout: 10000,
})

export interface BilibiliEpisode {
  ep_id: number
  title: string
  long_title: string
  pub_time: number // unix timestamp
  cover: string
}

export interface BilibiliSeasonInfo {
  season_id: string
  title: string
  cover: string
  total_ep: number
  episodes: BilibiliEpisode[]
}

// season_id is the numeric ID from the URL, e.g. bilibili.com/bangumi/play/ss12548 → "12548"
export async function getBilibiliSeason(seasonId: string): Promise<BilibiliSeasonInfo | null> {
  try {
    const { data } = await api.get('/pgc/view/web/season', {
      params: { season_id: seasonId },
    })
    if (data.code !== 0) return null
    const result = data.result
    return {
      season_id: seasonId,
      title: result.title,
      cover: result.cover,
      total_ep: result.total ?? result.episodes?.length ?? 0,
      episodes: (result.episodes ?? []).map((ep: Record<string, unknown>) => ({
        ep_id: ep.ep_id,
        title: String(ep.title ?? ''),
        long_title: String(ep.long_title ?? ''),
        pub_time: Number(ep.pub_time ?? 0),
        cover: String(ep.cover ?? ''),
      })),
    }
  } catch {
    return null
  }
}

export async function getLatestBilibiliEpisode(seasonId: string) {
  const season = await getBilibiliSeason(seasonId)
  if (!season || season.episodes.length === 0) return null
  const latest = season.episodes[season.episodes.length - 1]
  return { season, episode: latest }
}

// For user space (艺人动态 on Bilibili)
export async function getBilibiliUserPosts(uid: string, limit = 10) {
  try {
    const { data } = await api.get('/x/polymer/web-dynamic/v1/feed/space', {
      params: { host_mid: uid, offset: '', features: 'itemOpusStyle' },
    })
    if (data.code !== 0) return []
    return (data.data?.items ?? []).slice(0, limit).map((item: Record<string, unknown>) => {
      const modules = item.modules as Record<string, unknown>
      const dynText = (modules?.module_dynamic as Record<string, unknown>)
      const desc = (dynText?.desc as Record<string, unknown>)
      return {
        id: String(item.id_str ?? ''),
        content: String(desc?.text ?? ''),
        publishedAt: new Date(Number((modules?.module_author as Record<string, unknown>)?.pub_ts ?? 0) * 1000),
        postUrl: `https://www.bilibili.com/opus/${item.id_str}`,
        mediaUrls: [] as string[],
      }
    })
  } catch {
    return []
  }
}
