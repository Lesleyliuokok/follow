import axios from 'axios'
import * as cheerio from 'cheerio'

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: 'https://v.qq.com/',
  },
})

export interface TencentEpisodeInfo {
  latestEpisode: number
  totalEpisodes: number | null
  updatedAt: Date
}

// cid is the cover ID from URL: v.qq.com/x/cover/XXXX.html
export async function getTencentLatestEpisode(
  coverPageUrl: string,
): Promise<TencentEpisodeInfo | null> {
  try {
    const { data } = await http.get(coverPageUrl)
    const $ = cheerio.load(data)

    // Tencent embeds data in window.__INITIAL_DATA__ or similar
    const scripts = $('script')
      .map((_, el) => $(el).html() ?? '')
      .get()
    const dataScript = scripts.find(
      (s) => s.includes('episodeCountV2') || s.includes('episode_all') || s.includes('ep_count'),
    )

    if (dataScript) {
      const totalMatch = dataScript.match(/"ep_count"\s*:\s*(\d+)/)
      const latestMatch = dataScript.match(/"episode_countV2"\s*:\s*(\d+)/) ||
        dataScript.match(/"episodeCount"\s*:\s*(\d+)/)
      const latest = latestMatch ? parseInt(latestMatch[1], 10) : null
      if (latest) {
        return {
          latestEpisode: latest,
          totalEpisodes: totalMatch ? parseInt(totalMatch[1], 10) : null,
          updatedAt: new Date(),
        }
      }
    }

    // Fallback: count episode buttons
    const eps = $('[class*="episode_item"], [class*="ep_item"]').length
    if (eps > 0) {
      return { latestEpisode: eps, totalEpisodes: null, updatedAt: new Date() }
    }

    return null
  } catch {
    return null
  }
}
