// 抖音反爬最重，需要 Playwright + 有效 Cookie + 签名参数
// 建议结合 Browserless 云服务使用
import { chromium } from 'playwright-core'

export interface DouyinPost {
  id: string
  content: string
  mediaUrls: string[]
  postUrl: string
  publishedAt: Date
}

export async function getDouyinUserPosts(secUserId: string, limit = 10): Promise<DouyinPost[]> {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      extraHTTPHeaders: {
        Cookie: process.env.DOUYIN_COOKIE ?? '',
      },
    })
    const page = await context.newPage()

    const posts: DouyinPost[] = []
    page.on('response', async (resp) => {
      if (resp.url().includes('/aweme/v1/web/aweme/post/') && posts.length === 0) {
        try {
          const json = await resp.json()
          const awemes = json?.aweme_list ?? []
          for (const item of awemes.slice(0, limit)) {
            posts.push({
              id: item.aweme_id,
              content: item.desc ?? '',
              mediaUrls: item.video?.play_addr?.url_list ?? [],
              postUrl: `https://www.douyin.com/video/${item.aweme_id}`,
              publishedAt: new Date(item.create_time * 1000),
            })
          }
        } catch {}
      }
    })

    await page.goto(`https://www.douyin.com/user/${secUserId}`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    })

    return posts
  } catch {
    return []
  } finally {
    await browser?.close()
  }
}
