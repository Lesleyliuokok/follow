import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, ChevronLeft, Tv } from 'lucide-react'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { PLATFORM_LABELS } from '@/types'
import FollowButton from './FollowButton'
import EditUrlButton from './EditUrlButton'
import { imgSrc } from '@/lib/img'

const PLATFORM_BADGE: Record<string, string> = {
  BILIBILI: 'bg-pink-50 text-pink-600 border-pink-200',
  IQIYI: 'bg-green-50 text-green-700 border-green-200',
  TENCENT: 'bg-orange-50 text-orange-600 border-orange-200',
  YOUKU: 'bg-blue-50 text-blue-700 border-blue-200',
  DOUYIN: 'bg-gray-900 text-white border-gray-900',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AIRING: { label: '更新中', color: 'bg-green-500 text-white' },
  COMPLETED: { label: '已完结', color: 'bg-gray-400 text-white' },
  UPCOMING: { label: '即将播出', color: 'bg-yellow-500 text-white' },
}

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [show, session] = await Promise.all([
    prisma.show.findUnique({
      where: { id },
      include: {
        updates: { orderBy: { episode: 'desc' }, take: 30 },
      },
    }),
    auth(),
  ])

  if (!show) notFound()

  // Check if current user follows this show
  const userId = session?.user?.id
  const isFollowed = userId
    ? !!(await prisma.subscription.findUnique({
        where: { userId_showId: { userId, showId: id } },
      }))
    : false

  const status = STATUS_LABELS[show.status] ?? STATUS_LABELS.AIRING
  const platformLabel = PLATFORM_LABELS[show.platform]
  const cover = imgSrc(show.coverImage ?? null)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href="/subscriptions"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        返回追踪
      </Link>

      {/* Hero */}
      <div className="flex gap-8 mb-10">
        {/* Cover */}
        <div className="flex-shrink-0 w-44 md:w-56">
          <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-gray-100 shadow-md">
            {cover ? (
              <Image src={cover} alt={show.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Tv size={40} className="text-gray-300" />
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 py-1">
          {/* Platform + status */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${PLATFORM_BADGE[show.platform] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
            >
              {platformLabel}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
              {status.label}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-4 leading-snug">{show.title}</h1>

          {/* Episode progress */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-5">
            {show.latestEpisode != null && (
              <span>
                已更新 <strong className="text-gray-800">{show.latestEpisode}</strong> 集
              </span>
            )}
            {show.totalEpisodes != null && (
              <span>
                共 <strong className="text-gray-800">{show.totalEpisodes}</strong> 集
              </span>
            )}
            {show.lastChecked && (
              <span className="text-gray-400">
                上次检查 {new Date(show.lastChecked).toLocaleDateString('zh-CN')}
              </span>
            )}
          </div>

          {show.description && (
            <p className="text-sm text-gray-500 leading-relaxed mb-5 max-w-lg line-clamp-4">
              {show.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Primary platform link — editable for logged-in users */}
            {userId ? (
              <EditUrlButton
                showId={show.id}
                platformUrl={show.platformUrl}
                platformLabel={platformLabel}
              />
            ) : (
              <a
                href={show.platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <ExternalLink size={15} />
                去 {platformLabel} 观看
              </a>
            )}

            {/* Extra platforms (e.g. a show simulcast on both Tencent & Bilibili) */}
            {Array.isArray(show.extraPlatforms) &&
              (show.extraPlatforms as { platform: string; platformUrl: string }[]).map((ep) => (
                <a
                  key={ep.platform}
                  href={ep.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border transition-colors ${PLATFORM_BADGE[ep.platform] ?? 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
                >
                  <ExternalLink size={15} />
                  去 {PLATFORM_LABELS[ep.platform as keyof typeof PLATFORM_LABELS] ?? ep.platform} 观看
                </a>
              ))}

            {userId ? (
              <FollowButton showId={show.id} initialFollowed={isFollowed} />
            ) : (
              <Link
                href="/api/auth/signin"
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                登录后追踪
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Update history */}
      {show.updates.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            更新记录
          </h2>
          <div className="space-y-2">
            {show.updates.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 px-4 py-3"
              >
                <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-50 text-sm font-semibold text-gray-700 border border-gray-100">
                  {u.episode}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    第 {u.episode} 集{u.title ? `：${u.title}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(u.publishedAt).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <a
                  href={show.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                >
                  观看 <ExternalLink size={11} />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* No updates yet */}
      {show.updates.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">暂无更新记录</p>
          <p className="text-xs mt-1">追踪后，新集上线时会自动通知你</p>
        </div>
      )}
    </div>
  )
}
