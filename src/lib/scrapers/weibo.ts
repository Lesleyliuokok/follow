import axios from 'axios'

// Requires a valid Weibo cookie for authenticated requests
// Set WEIBO_COOKIE in .env
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://weibo.com/',
    Cookie: process.env.WEIBO_COOKIE ?? '',
  },
})

export interface WeiboPost {
  id: string
  content: string
  mediaUrls: string[]
  postUrl: string
  publishedAt: Date
}

export async function getWeiboUserPosts(uid: string, limit = 10): Promise<WeiboPost[]> {
  try {
    const { data } = await http.get(`https://weibo.com/ajax/statuses/mymblog`, {
      params: { uid, page: 1, feature: 0 },
    })
    const posts = data?.data?.list ?? []
    return posts.slice(0, limit).map((p: Record<string, unknown>) => {
      const pics = (p.pic_ids as string[] | undefined) ?? []
      const picInfos = (p.pic_infos as Record<string, Record<string, unknown>> | undefined) ?? {}
      return {
        id: String(p.id ?? p.idstr ?? ''),
        content: String(p.text_raw ?? p.text ?? ''),
        mediaUrls: pics.map((pid) => String((picInfos[pid]?.original as Record<string, unknown>)?.url ?? '')).filter(Boolean),
        postUrl: `https://weibo.com/${uid}/${p.mblogid}`,
        publishedAt: new Date(String(p.created_at ?? '')),
      }
    })
  } catch {
    return []
  }
}
