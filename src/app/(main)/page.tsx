import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { TimelineFeed } from '@/components/timeline/TimelineFeed'
import { Search, Tv, ChevronRight } from 'lucide-react'
import type { TimelineItem } from '@/types'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS, PLATFORM_COLORS } from '@/types'
import { imgSrc } from '@/lib/img'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const subs = await prisma.subscription.findMany({
    where: { userId },
    select: { showId: true, celebrityId: true },
  })

  const showIds = subs.map((s) => s.showId).filter(Boolean) as string[]
  const celebIds = subs.map((s) => s.celebrityId).filter(Boolean) as string[]

  const [showUpdates, socialPosts, airingShows, followedCelebs] = await Promise.all([
    showIds.length > 0
      ? prisma.showUpdate.findMany({
          where: { showId: { in: showIds } },
          include: { show: true },
          orderBy: { publishedAt: 'desc' },
          take: 50,
        })
      : [],
    celebIds.length > 0
      ? prisma.socialPost.findMany({
          where: { celebrityPlatform: { celebrityId: { in: celebIds } } },
          include: { celebrityPlatform: { include: { celebrity: true } } },
          orderBy: { publishedAt: 'desc' },
          take: 50,
        })
      : [],
    showIds.length > 0
      ? prisma.show.findMany({
          where: { id: { in: showIds }, status: 'AIRING' },
          orderBy: { updatedAt: 'desc' },
          take: 8,
        })
      : [],
    celebIds.length > 0
      ? prisma.celebrity.findMany({
          where: { id: { in: celebIds } },
          include: { platforms: { select: { platform: true } } },
          take: 8,
        })
      : [],
  ])

  // Build sorted timeline
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
  ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  const isEmpty = subs.length === 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {isEmpty ? (
        <div className="max-w-lg mx-auto text-center py-20">
          <div className="text-6xl mb-6">📺</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">还没有追踪任何内容</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            去发现页搜索你喜欢的剧集或艺人，<br />追踪后这里会显示最新动态。
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors"
          >
            <Search size={18} />
            去发现内容
          </Link>
        </div>
      ) : (
        <div className="flex gap-8">
          {/* ── Timeline ───────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 mb-6">最新动态</h1>
            <TimelineFeed items={items} />
          </div>

          {/* ── Sidebar ────────────────────────────────── */}
          <div className="w-64 flex-shrink-0 hidden lg:flex flex-col gap-4">

            {/* Airing shows */}
            {airingShows.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  在追的剧
                </h2>
                <div className="flex flex-col gap-3">
                  {airingShows.map((show) => (
                    <Link
                      key={show.id}
                      href={`/shows/${show.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="relative w-9 h-12 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                        {show.coverImage ? (
                          <Image src={imgSrc(show.coverImage)!} alt={show.title} fill className="object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Tv size={14} className="text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {show.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: PLATFORM_COLORS[show.platform] }}
                          />
                          {PLATFORM_LABELS[show.platform]}
                          {show.latestEpisode ? ` · 第${show.latestEpisode}集` : ''}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                {showIds.length > airingShows.length && (
                  <Link
                    href="/subscriptions"
                    className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    查看全部追踪
                    <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            )}

            {/* Followed celebrities */}
            {followedCelebs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  关注的艺人
                </h2>
                <div className="flex flex-col gap-2.5">
                  {followedCelebs.map((celeb) => (
                    <Link
                      key={celeb.id}
                      href={`/celebrities/${celeb.id}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <div className="relative w-8 h-8 flex-shrink-0 rounded-full overflow-hidden bg-gray-100">
                        {celeb.avatar ? (
                          <Image src={imgSrc(celeb.avatar)!} alt={celeb.name} fill className="object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-xs font-bold text-gray-400">
                            {celeb.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {celeb.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {celeb.platforms.map((p) => SOCIAL_PLATFORM_LABELS[p.platform]).join(' · ') || '暂无平台'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick search */}
            <Link
              href="/search"
              className="flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
            >
              <Search size={14} />
              搜索更多内容
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
