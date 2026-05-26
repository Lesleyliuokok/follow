import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToSubscribers } from '@/lib/push'
import { getWeiboUserPosts } from '@/lib/scrapers/weibo'
import { getBilibiliUserPosts } from '@/lib/scrapers/bilibili'
import { getXhsUserPosts } from '@/lib/scrapers/xiaohongshu'
import { getDouyinUserPosts } from '@/lib/scrapers/douyin'
import { SOCIAL_PLATFORM_LABELS } from '@/types'

// Called by Vercel Cron every 30 minutes
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const celebPlatforms = await prisma.celebrityPlatform.findMany({
    include: { celebrity: true },
  })

  const newPosts = []

  for (const cp of celebPlatforms) {
    try {
      let posts: { id: string; content: string; mediaUrls: string[]; postUrl: string; publishedAt: Date }[] = []

      if (cp.platform === 'WEIBO') posts = await getWeiboUserPosts(cp.platformId)
      else if (cp.platform === 'BILIBILI') posts = await getBilibiliUserPosts(cp.platformId)
      else if (cp.platform === 'XIAOHONGSHU') posts = await getXhsUserPosts(cp.platformId)
      else if (cp.platform === 'DOUYIN') posts = await getDouyinUserPosts(cp.platformId)

      for (const post of posts) {
        const exists = await prisma.socialPost.findUnique({
          where: { celebrityPlatformId_platformPostId: { celebrityPlatformId: cp.id, platformPostId: post.id } },
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
          body: post.content.slice(0, 80) || `在${SOCIAL_PLATFORM_LABELS[cp.platform]}发布了新内容`,
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
      console.error(`Failed to check celebrity platform ${cp.id}:`, err)
    }
  }

  return NextResponse.json({ checked: celebPlatforms.length, newPosts })
}
