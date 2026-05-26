// 小红书没有公开 API，需要 Playwright 无头浏览器 + 有效 Cookie
// 生产环境建议用 Browserless 或 Playwright Cloud 托管
import { chromium } from 'playwright-core'

export interface XhsPost {
  id: string
  content: string
  mediaUrls: string[]
  postUrl: string
  publishedAt: Date
}

export async function getXhsUserPosts(userId: string, limit = 10): Promise<XhsPost[]> {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        Cookie: process.env.XHS_COOKIE ?? '',
      },
    })
    const page = await context.newPage()

    // Intercept the API response
    const posts: XhsPost[] = []
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/sns/web/v1/user_posted') && posts.length === 0) {
        try {
          const json = await resp.json()
          const notes = json?.data?.notes ?? []
          for (const note of notes.slice(0, limit)) {
            posts.push({
              id: note.id ?? note.note_id,
              content: note.desc ?? note.title ?? '',
              mediaUrls: (note.image_list ?? []).map((img: Record<string, unknown>) => String(img.url ?? img.url_default ?? '')),
              postUrl: `https://www.xiaohongshu.com/explore/${note.id ?? note.note_id}`,
              publishedAt: note.time ? new Date(note.time * 1000) : new Date(),
            })
          }
        } catch {}
      }
    })

    await page.goto(`https://www.xiaohongshu.com/user/profile/${userId}`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    })

    return posts
  } catch {
    return []
  } finally {
    await browser?.close()
  }
}
