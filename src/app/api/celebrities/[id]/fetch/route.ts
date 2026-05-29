/**
 * POST /api/celebrities/[id]/fetch
 * Manually trigger a social post scrape for a single celebrity.
 * Requires a valid login session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getBilibiliUserPosts } from '@/lib/scrapers/bilibili'
import { getWeiboUserPosts } from '@/lib/scrapers/weibo'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: celebrityId } = await params

  const platforms = await prisma.celebrityPlatform.findMany({
    where: { celebrityId },
  })

  if (platforms.length === 0) {
    return NextResponse.json({ ok: true, newPosts: 0 })
  }

  let newPosts = 0

  for (const cp of platforms) {
    try {
      type Post = { id: string; content: string; mediaUrls: string[]; postUrl: string; publishedAt: Date }
      let posts: Post[] = []

      if (cp.platform === 'WEIBO') {
        posts = await getWeiboUserPosts(cp.platformId)
      } else if (cp.platform === 'BILIBILI') {
        posts = await getBilibiliUserPosts(cp.platformId)
      }

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
        newPosts++
      }

      await prisma.celebrityPlatform.update({
        where: { id: cp.id },
        data: { lastChecked: new Date() },
      })
    } catch (err) {
      console.error(`[fetch] failed for platform ${cp.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, newPosts })
}
