'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Tv, Search, X, Loader2 } from 'lucide-react'
import { imgSrc } from '@/lib/img'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS } from '@/types'

interface ShowSub {
  id: string
  show: {
    id: string
    title: string
    platform: string
    status: string
    coverImage: string | null
    latestEpisode: number | null
  }
}

interface CelebSub {
  id: string
  celebrity: {
    id: string
    name: string
    avatar: string | null
    platforms: { platform: string }[]
  }
}

type Sub = ShowSub | CelebSub

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((data) => { setSubs(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function unsubscribe(sub: Sub, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const key = sub.id
    setRemoving((prev) => new Set(prev).add(key))
    try {
      await fetch('/api/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          'show' in sub && sub.show
            ? { showId: (sub as ShowSub).show.id }
            : { celebrityId: (sub as CelebSub).celebrity.id },
        ),
      })
      setSubs((prev) => prev.filter((s) => s.id !== key))
    } finally {
      setRemoving((prev) => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const showSubs = subs.filter((s): s is ShowSub => 'show' in s && !!s.show)
  const celebSubs = subs.filter((s): s is CelebSub => 'celebrity' in s && !!s.celebrity)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 flex justify-center">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    )
  }

  if (subs.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-8">我的追踪</h1>
        <div className="text-center py-20">
          <div className="text-6xl mb-6">🔖</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">还没有追踪任何内容</h2>
          <p className="text-gray-500 mb-8">去发现你喜欢的剧集和艺人吧</p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors"
          >
            <Search size={18} />
            去发现
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-lg font-semibold text-gray-900">我的追踪</h1>
        <span className="text-sm text-gray-400">共 {subs.length} 个</span>
      </div>

      {/* ── 剧集 / 综艺 ──────────────────────────────────────────────────── */}
      {showSubs.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            追剧 / 追综 · {showSubs.length}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {showSubs.map((sub) => {
              const { show } = sub
              return (
                <div key={sub.id} className="relative group">
                  <Link
                    href={`/shows/${show.id}`}
                    className="block bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all"
                  >
                    <div className="relative w-full aspect-[2/3] bg-gray-100">
                      {show.coverImage ? (
                        <Image
                          src={imgSrc(show.coverImage)!}
                          alt={show.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Tv size={28} className="text-gray-300" />
                        </div>
                      )}
                      <div className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                        show.status === 'AIRING' ? 'bg-green-500 text-white'
                        : show.status === 'COMPLETED' ? 'bg-gray-500 text-white'
                        : 'bg-yellow-500 text-white'
                      }`}>
                        {show.status === 'AIRING' ? '更新中' : show.status === 'COMPLETED' ? '完结' : '未播'}
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-gray-900 text-sm line-clamp-2 leading-snug">
                        {show.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {PLATFORM_LABELS[show.platform as keyof typeof PLATFORM_LABELS] ?? show.platform}
                        {show.latestEpisode ? ` · 第 ${show.latestEpisode} 集` : ''}
                      </p>
                    </div>
                  </Link>
                  {/* Remove button */}
                  <button
                    onClick={(e) => unsubscribe(sub, e)}
                    disabled={removing.has(sub.id)}
                    className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full transition-all disabled:opacity-40"
                    title="取消追踪"
                  >
                    {removing.has(sub.id)
                      ? <Loader2 size={11} className="animate-spin" />
                      : <X size={11} />}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 艺人 ─────────────────────────────────────────────────────────── */}
      {celebSubs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            追艺人 · {celebSubs.length}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {celebSubs.map((sub) => {
              const { celebrity } = sub
              return (
                <div key={sub.id} className="relative group">
                  <Link
                    href={`/celebrities/${celebrity.id}`}
                    className="block bg-white rounded-xl border border-gray-100 p-4 text-center hover:border-gray-200 hover:shadow-sm transition-all"
                  >
                    <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100 mx-auto mb-3">
                      {celebrity.avatar ? (
                        <Image
                          src={imgSrc(celebrity.avatar)!}
                          alt={celebrity.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xl font-bold text-gray-300">
                          {celebrity.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 text-sm">{celebrity.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {celebrity.platforms
                        .map((p) => SOCIAL_PLATFORM_LABELS[p.platform as keyof typeof SOCIAL_PLATFORM_LABELS])
                        .filter(Boolean)
                        .join(' · ') || '暂无平台'}
                    </p>
                  </Link>
                  {/* Remove button */}
                  <button
                    onClick={(e) => unsubscribe(sub, e)}
                    disabled={removing.has(sub.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full transition-all disabled:opacity-40"
                    title="取消追踪"
                  >
                    {removing.has(sub.id)
                      ? <Loader2 size={11} className="animate-spin" />
                      : <X size={11} />}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
