'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Tv, User, Search, X, Loader2 } from 'lucide-react'
import { imgSrc } from '@/lib/img'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS } from '@/types'

interface ShowSub {
  id: string // subscription id
  show: {
    id: string
    title: string
    platform: string
    status: string
    coverImage: string | null
  }
}

interface CelebSub {
  id: string // subscription id
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

  async function unsubscribe(sub: Sub) {
    const isShow = 'show' in sub && sub.show
    const key = sub.id
    setRemoving((prev) => new Set(prev).add(key))
    try {
      await fetch('/api/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isShow
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
      <div className="max-w-4xl mx-auto px-6 py-16 flex justify-center">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    )
  }

  if (subs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-lg font-semibold text-gray-900">我的追踪</h1>
        <span className="text-sm text-gray-400">共 {subs.length} 个</span>
      </div>

      {/* ── 剧集 / 综艺 ──────────────────────────────────────────────────── */}
      {showSubs.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            剧集 / 综艺 · {showSubs.length}
          </h2>
          <div className="flex flex-col gap-2">
            {showSubs.map((sub) => {
              const { show } = sub
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-all"
                >
                  {/* Cover thumbnail */}
                  <Link href={`/shows/${show.id}`} className="shrink-0">
                    <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-gray-100">
                      {show.coverImage ? (
                        <Image src={imgSrc(show.coverImage)!} alt={show.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Tv size={16} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Info */}
                  <Link href={`/shows/${show.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{show.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {PLATFORM_LABELS[show.platform as keyof typeof PLATFORM_LABELS] ?? show.platform}
                      <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        show.status === 'AIRING' ? 'bg-green-100 text-green-700'
                        : show.status === 'COMPLETED' ? 'bg-gray-100 text-gray-500'
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {show.status === 'AIRING' ? '更新中' : show.status === 'COMPLETED' ? '已完结' : '未播出'}
                      </span>
                    </p>
                  </Link>

                  {/* Remove */}
                  <button
                    onClick={() => unsubscribe(sub)}
                    disabled={removing.has(sub.id)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="取消追踪"
                  >
                    {removing.has(sub.id)
                      ? <Loader2 size={14} className="animate-spin" />
                      : <X size={14} />}
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
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            艺人 · {celebSubs.length}
          </h2>
          <div className="flex flex-col gap-2">
            {celebSubs.map((sub) => {
              const { celebrity } = sub
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-all"
                >
                  {/* Avatar */}
                  <Link href={`/celebrities/${celebrity.id}`} className="shrink-0">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100">
                      {celebrity.avatar ? (
                        <Image src={imgSrc(celebrity.avatar)!} alt={celebrity.name} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm font-bold text-gray-300">
                          <User size={16} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Info */}
                  <Link href={`/celebrities/${celebrity.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{celebrity.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {celebrity.platforms
                        .map((p) => SOCIAL_PLATFORM_LABELS[p.platform as keyof typeof SOCIAL_PLATFORM_LABELS])
                        .filter(Boolean)
                        .join(' · ') || '暂无平台'}
                    </p>
                  </Link>

                  {/* Remove */}
                  <button
                    onClick={() => unsubscribe(sub)}
                    disabled={removing.has(sub.id)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="取消追踪"
                  >
                    {removing.has(sub.id)
                      ? <Loader2 size={14} className="animate-spin" />
                      : <X size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 底部操作 ─────────────────────────────────────────────────────── */}
      <div className="mt-10 pt-6 border-t border-gray-100 flex justify-center">
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Search size={15} />
          添加追踪
        </Link>
      </div>
    </div>
  )
}
