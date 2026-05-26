import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { TimelineItem } from '@/types'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const subs = await prisma.subscription.findMany({
    where: { userId },
    select: { showId: true, celebrityId: true },
  })

  const showIds = subs.map((s) => s.showId).filter(Boolean) as string[]
  const celebrityIds = subs.map((s) => s.celebrityId).filter(Boolean) as string[]

  const [showUpdates, socialPosts] = await Promise.all([
    prisma.showUpdate.findMany({
      where: { showId: { in: showIds } },
      include: { show: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    }),
    prisma.socialPost.findMany({
      where: { celebrityPlatform: { celebrityId: { in: celebrityIds } } },
      include: { celebrityPlatform: { include: { celebrity: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    }),
  ])

  const items: TimelineItem[] = [
    ...showUpdates.map((u): TimelineItem => ({
      id: u.id,
      type: 'show_update',
      publishedAt: u.publishedAt,
      show: {
        id: u.show.id,
        title: u.show.title,
        platform: u.show.platform,
        platformUrl: u.show.platformUrl,
        coverImage: u.show.coverImage,
      },
      episode: u.episode,
      episodeTitle: u.title,
    })),
    ...socialPosts.map((p): TimelineItem => ({
      id: p.id,
      type: 'social_post',
      publishedAt: p.publishedAt,
      celebrity: {
        id: p.celebrityPlatform.celebrity.id,
        name: p.celebrityPlatform.celebrity.name,
        avatar: p.celebrityPlatform.celebrity.avatar,
      },
      socialPlatform: p.celebrityPlatform.platform,
      content: p.content,
      mediaUrls: p.mediaUrls,
      postUrl: p.postUrl,
    })),
  ].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

  return NextResponse.json(items)
}
