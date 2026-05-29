import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToSubscribers } from '@/lib/push'
import { getBilibiliUserPosts } from '@/lib/scrapers/bilibili'
import { getWeiboUserPosts } from '@/lib/scrapers/weibo'
import { SOCIAL_PLATFORM_LABELS } from '@/types'

// Called by Vercel Cron every 30 min — or manually via GET /api/cron/social?secret=CRON_SECRET
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const secretParam = searchParams.get('secret')

  const authorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secretParam === process.env.CRON_SECRET

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const celebPlatforms = await prisma.celebrityPlatform.findMany({
    include: { celebrity: true },
  })

  const newPosts: { celebrity: string; platform: string; postId: string }[] = []

  for (const cp of celebPlatforms) {
    try {
      type Post = { id: string; content: string; mediaUrls: string[]; postUrl: string; publishedAt: Date }
      let posts: Post[] = []

      if (cp.platform === 'BILIBILI') {
        posts = await getBilibiliUserPosts(cp.platformId)
      } else if (cp.platform === 'WEIBO') {
        posts = await getWeiboUserPosts(cp.platformId)
      }
      // XIAOHONGSHU / DOUYIN — need cookies, skip for now

      for (const post of posts) {
        if (!post.id) continue

        const exists = await prisma.socialPost.findUnique({
          where: {
            celebrityPlatformId_platformPostId: {
              celebrityPlatformId: cp.id,
              platformPostId: post.id,
            },
          },
        })
        if (exists) continue

        await prisma.socialPost.create({
          data: {
            celebrityPlatformId: cp.id,
            platformPostId: post.id,
            content: post.content,
            mediaUrls: post.mediaUrls,
            postUrl: post.postUrl,
            publishedAt: post.publishedAt,
          },
        })

        await sendPushToSubscribers(undefined, cp.celebrityId, {
          title: `${cp.celebrity.name} 有新动态`,
          body:
            post.content.slice(0, 80) ||
            `在 ${SOCIAL_PLATFORM_LABELS[cp.platform]} 发布了新内容`,
          icon: cp.celebrity.avatar ?? undefined,
          url: post.postUrl,
        })

        newPosts.push({ celebrity: cp.celebrity.name, platform: cp.platform, postId: post.id })
      }

      await prisma.celebrityPlatform.update({
        where: { id: cp.id },
        data: { lastChecked: new Date() },
      })
    } catch (err) {
      console.error(`[cron/social] failed for ${cp.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    checked: celebPlatforms.length,
    newPosts,
  })
}
