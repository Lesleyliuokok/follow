import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { TimelineItem } from '@/components/timeline/TimelineItem'
import type { TimelineItem as TTimelineItem } from '@/types'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

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

  const items: TTimelineItem[] = [
    ...showUpdates.map((u): TTimelineItem => ({
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
    ...socialPosts.map((p): TTimelineItem => ({
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
  ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">最新动态</h1>
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📺</p>
          <p className="font-medium">还没有任何追踪内容</p>
          <p className="text-sm mt-1">去搜索剧集或艺人，开始追踪吧</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <TimelineItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  )
}
