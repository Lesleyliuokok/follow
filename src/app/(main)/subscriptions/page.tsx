import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Image from 'next/image'
import { Tv, User, Trash2 } from 'lucide-react'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS } from '@/types'

export default async function SubscriptionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const subs = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    include: {
      show: true,
      celebrity: { include: { platforms: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const showSubs = subs.filter((s) => s.show)
  const celebSubs = subs.filter((s) => s.celebrity)

  return (
    <main className="max-w-lg mx-auto px-4 py-6 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-6">我的追踪</h1>

      {showSubs.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">追剧</h2>
          <div className="flex flex-col gap-2">
            {showSubs.map(({ show }) => show && (
              <div key={show.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
                <div className="relative w-10 h-13 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                  {show.coverImage ? (
                    <Image src={show.coverImage} alt={show.title} fill className="object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full"><Tv size={18} className="text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{show.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {PLATFORM_LABELS[show.platform]}
                    {show.latestEpisode ? ` · 已更新至第${show.latestEpisode}集` : ''}
                    {show.status === 'COMPLETED' ? ' · 已完结' : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  show.status === 'AIRING' ? 'bg-green-50 text-green-600' :
                  show.status === 'COMPLETED' ? 'bg-gray-100 text-gray-500' :
                  'bg-yellow-50 text-yellow-600'
                }`}>
                  {show.status === 'AIRING' ? '更新中' : show.status === 'COMPLETED' ? '完结' : '未播'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {celebSubs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">追艺人</h2>
          <div className="flex flex-col gap-2">
            {celebSubs.map(({ celebrity }) => celebrity && (
              <div key={celebrity.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
                <div className="relative w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-gray-100">
                  {celebrity.avatar ? (
                    <Image src={celebrity.avatar} alt={celebrity.name} fill className="object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 font-bold">{celebrity.name[0]}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{celebrity.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {celebrity.platforms.map((p) => SOCIAL_PLATFORM_LABELS[p.platform]).join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {subs.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔖</p>
          <p className="font-medium">还没有追踪任何内容</p>
          <p className="text-sm mt-1">去搜索页添加剧集和艺人</p>
        </div>
      )}
    </main>
  )
}
