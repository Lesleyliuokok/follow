/**
 * Douban subject-suggest API — used to search Chinese TV shows from any platform.
 * Returns title, cover image, year, total episodes, and Douban subject ID.
 * Uses a direct undici Agent to bypass the VPN proxy.
 */
import { Agent, fetch as undiciFetch } from 'undici'

const directAgent = new Agent()

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://movie.douban.com',
  Accept: 'application/json, */*',
}

export interface DoubanShow {
  doubanId: string
  title: string
  year: string
  totalEpisodes: number | null
  coverImage: string | null
}

export interface DoubanCelebrity {
  doubanId: string   // Douban celebrity ID (e.g. "1410267")
  name: string
  coverImage: string | null
}

export async function searchDoubanCelebrities(keyword: string): Promise<DoubanCelebrity[]> {
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}&callback=`
  try {
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: HEADERS })
    if (!res.ok) return []
    const text = await res.text()
    const json = text.startsWith('callback(') ? text.slice(9, -1) : text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = JSON.parse(json)
    return items
      .filter((it) => it.type === 'celebrity' && it.id && it.title)
      .map((it): DoubanCelebrity => ({
        doubanId: String(it.id),
        name: it.title ?? '',
        coverImage: it.img ?? null,
      }))
  } catch {
    return []
  }
}

export async function searchDoubanShows(keyword: string): Promise<DoubanShow[]> {
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}&callback=`
  try {
    const res = await undiciFetch(url, { dispatcher: directAgent, headers: HEADERS })
    if (!res.ok) return []
    const text = await res.text()
    // strip JSONP wrapper if any
    const json = text.startsWith('callback(') ? text.slice(9, -1) : text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = JSON.parse(json)

    return items
      .filter((it) => it.id && it.title)
      .slice(0, 10)
      .map((it): DoubanShow => ({
        doubanId: String(it.id),
        title: it.title ?? '',
        year: it.year ?? '',
        totalEpisodes: it.episode ? parseInt(it.episode, 10) || null : null,
        coverImage: it.img ?? null,
      }))
  } catch {
    return []
  }
}
