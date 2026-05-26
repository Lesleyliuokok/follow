import axios from 'axios'
import * as cheerio from 'cheerio'

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
})

export interface IqiyiEpisodeInfo {
  latestEpisode: number
  totalEpisodes: number | null
  latestTitle: string
  updatedAt: Date
}

// albumId is from the URL: www.iqiyi.com/v_XXXXX.html → use album page
// More reliable: use the album detail API with the tvid
export async function getIqiyiLatestEpisode(
  albumPageUrl: string,
): Promise<IqiyiEpisodeInfo | null> {
  try {
    const { data } = await http.get(albumPageUrl)
    const $ = cheerio.load(data)

    // Try to find episode count from meta or script tags
    const scriptContent = $('script')
      .map((_, el) => $(el).html() ?? '')
      .get()
      .find((s) => s.includes('episodeCount') || s.includes('totalEpisode'))

    if (scriptContent) {
      const totalMatch = scriptContent.match(/"episodeCount"\s*:\s*(\d+)/)
      const latestMatch = scriptContent.match(/"latestEpisodeNum"\s*:\s*(\d+)/)
      if (latestMatch) {
        return {
          latestEpisode: parseInt(latestMatch[1], 10),
          totalEpisodes: totalMatch ? parseInt(totalMatch[1], 10) : null,
          latestTitle: `第${latestMatch[1]}集`,
          updatedAt: new Date(),
        }
      }
    }

    // Fallback: parse episode list from DOM
    const episodeLinks = $('[class*="episode"] a, [class*="Episode"] a').length
    if (episodeLinks > 0) {
      return {
        latestEpisode: episodeLinks,
        totalEpisodes: null,
        latestTitle: `第${episodeLinks}集`,
        updatedAt: new Date(),
      }
    }

    return null
  } catch {
    return null
  }
}
