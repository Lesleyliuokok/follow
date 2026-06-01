'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, Plus, Check, Tv, User, Loader2, Flame } from 'lucide-react'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS } from '@/types'
import { imgSrc } from '@/lib/img'
import type { Platform } from '@prisma/client'

type SearchMode = 'shows' | 'celebrities'

// Shape returned by /api/trending
interface TrendingShow {
  title: string
  coverImage: string | null
  platform: Platform
  platformId: string
  platformUrl: string
  latestEpisode: number | null
  totalEpisodes: number | null
  status: 'AIRING' | 'COMPLETED' | 'UPCOMING'
  dbId: string | null
}

// ── Small card ─────────────────────────────────────────────────────────────

function ItemCard({
  id, title, image, mode, meta, status, subscribed, toggling, onToggle,
}: {
  id: string
  title: string
  image?: string
  mode: SearchMode
  meta?: string
  status?: string
  subscribed: boolean
  toggling?: boolean
  onToggle: (id: string) => void
}) {
  const detailHref = mode === 'shows' ? `/shows/${id}` : `/celebrities/${id}`
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all">
      <Link href={detailHref} className="block">
        <div className="relative w-full aspect-[2/3] bg-gray-100">
          {imgSrc(image) ? (
            <Image src={imgSrc(image)!} alt={title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex items-center justify-center h-full">
              {mode === 'shows' ? (
                <Tv size={32} className="text-gray-300" />
              ) : (
                <User size={32} className="text-gray-300" />
              )}
            </div>
          )}
          {status && (
            <div
              className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                status === 'AIRING'
                  ? 'bg-green-500 text-white'
                  : status === 'COMPLETED'
                    ? 'bg-gray-500 text-white'
                    : 'bg-yellow-500 text-white'
              }`}
            >
              {status === 'AIRING' ? '更新中' : status === 'COMPLETED' ? '完结' : '未播'}
            </div>
          )}
        </div>
      </Link>
      <div className="p-3">
        <Link href={detailHref}>
          <p className="font-medium text-gray-900 text-sm leading-snug mb-1 line-clamp-2 hover:text-blue-600 transition-colors">
            {title}
          </p>
        </Link>
        {meta && <p className="text-xs text-gray-400 mb-2">{meta}</p>}
        <button
          onClick={() => onToggle(id)}
          disabled={toggling}
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
            subscribed
              ? 'bg-green-50 text-green-600 border border-green-100'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}
        >
          {toggling ? (
            <Loader2 size={13} className="animate-spin" />
          ) : subscribed ? (
            <>
              <Check size={13} />已追踪
            </>
          ) : (
            <>
              <Plus size={13} />追踪
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// Card for trending shows not yet in the DB (no detail page available)
function TrendingCard({
  item, subscribed, toggling, onToggle,
}: {
  item: TrendingShow
  subscribed: boolean
  toggling?: boolean
  onToggle: () => void
}) {
  const detailHref = item.dbId ? `/shows/${item.dbId}` : item.platformUrl
  const isExternal = !item.dbId

  const meta = [
    PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform,
    item.latestEpisode ? `第 ${item.latestEpisode} 集` : item.totalEpisodes ? `共 ${item.totalEpisodes} 集` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all">
      <a href={detailHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined} className="block">
        <div className="relative w-full aspect-[2/3] bg-gray-100">
          {imgSrc(item.coverImage) ? (
            <Image src={imgSrc(item.coverImage)!} alt={item.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Tv size={32} className="text-gray-300" />
            </div>
          )}
          {item.status && (
            <div
              className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                item.status === 'AIRING'
                  ? 'bg-green-500 text-white'
                  : item.status === 'COMPLETED'
                    ? 'bg-gray-500 text-white'
                    : 'bg-yellow-500 text-white'
              }`}
            >
              {item.status === 'AIRING' ? '更新中' : item.status === 'COMPLETED' ? '完结' : '未播'}
            </div>
          )}
        </div>
      </a>
      <div className="p-3">
        <a href={detailHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}>
          <p className="font-medium text-gray-900 text-sm leading-snug mb-1 line-clamp-2 hover:text-blue-600 transition-colors">
            {item.title}
          </p>
        </a>
        {meta && <p className="text-xs text-gray-400 mb-2">{meta}</p>}
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
            subscribed
              ? 'bg-green-50 text-green-600 border border-green-100'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}
        >
          {toggling ? (
            <Loader2 size={13} className="animate-spin" />
          ) : subscribed ? (
            <>
              <Check size={13} />已追踪
            </>
          ) : (
            <>
              <Plus size={13} />追踪
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [mode, setMode] = useState<SearchMode>('shows')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Discovery content
  const [trending, setTrending] = useState<TrendingShow[]>([])
  const [discoverCelebs, setDiscoverCelebs] = useState<Record<string, unknown>[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(true)

  // Local map of platform:platformId → dbId for shows imported during this session
  const [trendingDbMap, setTrendingDbMap] = useState<Record<string, string>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load subscriptions + discovery data on mount
  useEffect(() => {
    // Subscriptions
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((subs: { showId?: string; celebrityId?: string }[]) => {
        const ids = new Set<string>()
        subs.forEach((s) => {
          if (s.showId) ids.add(s.showId)
          if (s.celebrityId) ids.add(s.celebrityId)
        })
        setSubscribed(ids)
      })
      .catch(() => {})

    // Discovery: trending shows + celebrities in parallel
    Promise.all([
      fetch('/api/trending').then((r) => r.json()).catch(() => []),
      fetch('/api/celebrities').then((r) => r.json()).catch(() => []),
    ]).then(([trendingData, celebs]) => {
      setTrending(Array.isArray(trendingData) ? trendingData : [])
      setDiscoverCelebs(Array.isArray(celebs) ? celebs : [])
      setDiscoverLoading(false)
    })
  }, [])

  // ── Search ───────────────────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      setResults([])
      try {
        const url =
          mode === 'shows'
            ? `/api/shows?q=${encodeURIComponent(q)}`
            : `/api/celebrities?q=${encodeURIComponent(q)}`
        setResults(await fetch(url, { cache: 'no-store' }).then((r) => r.json()))
      } finally {
        setLoading(false)
      }
    },
    [mode],
  )

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (!q.trim()) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      debounceRef.current = setTimeout(() => doSearch(q), 300)
    },
    [doSearch],
  )

  // ── Subscribe helpers ─────────────────────────────────────────────────────

  async function toggleSubscribe(id: string) {
    if (toggling.has(id)) return
    setToggling((prev) => new Set(prev).add(id))
    try {
      const isSub = subscribed.has(id)
      const body = mode === 'shows' ? { showId: id } : { celebrityId: id }
      const res = await fetch('/api/subscriptions', {
        method: isSub ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error ?? '操作失败，请稍后重试')
        setTimeout(() => setErrorMsg(null), 3000)
        return
      }
      setSubscribed((prev) => {
        const n = new Set(prev)
        if (isSub) n.delete(id); else n.add(id)
        return n
      })
    } finally {
      setToggling((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function toggleSubscribeTyped(id: string, type: SearchMode) {
    if (toggling.has(id)) return
    setToggling((prev) => new Set(prev).add(id))
    try {
      const isSub = subscribed.has(id)
      const body = type === 'shows' ? { showId: id } : { celebrityId: id }
      const res = await fetch('/api/subscriptions', {
        method: isSub ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error ?? '操作失败，请稍后重试')
        setTimeout(() => setErrorMsg(null), 3000)
        return
      }
      setSubscribed((prev) => {
        const n = new Set(prev)
        if (isSub) n.delete(id); else n.add(id)
        return n
      })
    } finally {
      setToggling((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  // Subscribe to a trending show — import to DB first if needed
  async function toggleTrendingSubscribe(item: TrendingShow) {
    const trendingKey = `${item.platform}:${item.platformId}`
    let dbId = item.dbId ?? trendingDbMap[trendingKey] ?? null
    if (dbId && toggling.has(dbId)) return
    const tempKey = trendingKey
    if (dbId) setToggling((prev) => new Set(prev).add(dbId!))

    try {
      if (!dbId) {
        // Import the show into the DB
        const importRes = await fetch('/api/shows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: item.platform,
            platformId: item.platformId,
            title: item.title,
            coverImage: item.coverImage,
            platformUrl: item.platformUrl,
            latestEpisode: item.latestEpisode,
            totalEpisodes: item.totalEpisodes,
            status: item.status,
          }),
        })
        if (!importRes.ok) return
        const show = await importRes.json()
        dbId = show.id as string
        setTrendingDbMap((prev) => ({ ...prev, [tempKey]: dbId! }))
        setToggling((prev) => new Set(prev).add(dbId!))
      }

      const isSub = subscribed.has(dbId)
      const res = await fetch('/api/subscriptions', {
        method: isSub ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId: dbId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error ?? '操作失败，请稍后重试')
        setTimeout(() => setErrorMsg(null), 3000)
        return
      }
      setSubscribed((prev) => {
        const n = new Set(prev)
        if (isSub) n.delete(dbId!); else n.add(dbId!)
        return n
      })
    } finally {
      if (dbId) setToggling((prev) => { const n = new Set(prev); n.delete(dbId!); return n })
    }
  }

  function isTrendingSubscribed(item: TrendingShow): boolean {
    const dbId = item.dbId ?? trendingDbMap[`${item.platform}:${item.platformId}`]
    return dbId ? subscribed.has(dbId) : false
  }

  const hasQuery = query.trim().length > 0

  // ── Meta helpers ──────────────────────────────────────────────────────────

  function showMeta(item: Record<string, unknown>): string {
    const parts: string[] = []
    if (item.platform)
      parts.push(
        PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? String(item.platform),
      )
    if (item.latestEpisode) parts.push(`第 ${String(item.latestEpisode)} 集`)
    else if (item.totalEpisodes) parts.push(`共 ${String(item.totalEpisodes)} 集`)
    return parts.join(' · ')
  }

  function celebMeta(item: Record<string, unknown>): string {
    const platforms = item.platforms as { platform: string }[] | undefined
    return (
      platforms
        ?.map(
          (p) => SOCIAL_PLATFORM_LABELS[p.platform as keyof typeof SOCIAL_PLATFORM_LABELS],
        )
        .join(' · ') ?? ''
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Error toast */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl shadow-md">
          {errorMsg}
        </div>
      )}
      {/* Search bar */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          {loading && (
            <Loader2
              size={16}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
            />
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索剧集、综艺、艺人…"
            className="w-full pl-11 pr-11 py-3.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all shadow-sm"
          />
        </div>

        {/* Mode tabs — only shown when actively searching */}
        {hasQuery && (
          <div className="flex gap-2 mt-3">
            {(['shows', 'celebrities'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setResults([])
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m === 'shows' ? <Tv size={14} /> : <User size={14} />}
                {m === 'shows' ? '剧集 / 综艺' : '艺人'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Search results ──────────────────────────────────────────────────── */}
      {hasQuery && (
        <>
          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {results.map((item) => {
                const id = item.id as string
                return (
                  <ItemCard
                    key={id}
                    id={id}
                    mode={mode}
                    title={(item.title || item.name) as string}
                    image={(item.coverImage || item.avatar) as string | undefined}
                    meta={mode === 'shows' ? showMeta(item) : celebMeta(item)}
                    status={mode === 'shows' ? (item.status as string) : undefined}
                    subscribed={subscribed.has(id)}
                    toggling={toggling.has(id)}
                    onToggle={(id) => toggleSubscribe(id)}
                  />
                )
              })}
            </div>
          ) : !loading ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium text-gray-600">没有找到「{query}」</p>
              <p className="text-sm mt-1">试试其他关键词</p>
            </div>
          ) : null}
        </>
      )}

      {/* ── Discovery sections ──────────────────────────────────────────────── */}
      {!hasQuery && (
        <div className="space-y-10">
          {/* Trending shows */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Flame size={16} className="text-orange-500" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
                热门推荐
              </h2>
              {discoverLoading && <Loader2 size={14} className="animate-spin text-gray-300 ml-1" />}
            </div>

            {!discoverLoading && trending.length === 0 && (
              <p className="text-sm text-gray-400 py-8 text-center">暂无热门内容</p>
            )}

            {trending.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {trending.map((item) => (
                  <TrendingCard
                    key={`${item.platform}:${item.platformId}`}
                    item={item}
                    subscribed={isTrendingSubscribed(item)}
                    toggling={(() => {
                      const dbId = item.dbId ?? trendingDbMap[`${item.platform}:${item.platformId}`]
                      return dbId ? toggling.has(dbId) : false
                    })()}
                    onToggle={() => toggleTrendingSubscribe(item)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Celebrities */}
          {!discoverLoading && discoverCelebs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
                艺人
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {discoverCelebs.slice(0, 10).map((item) => {
                  const id = item.id as string
                  return (
                    <ItemCard
                      key={id}
                      id={id}
                      mode="celebrities"
                      title={item.name as string}
                      image={item.avatar as string | undefined}
                      meta={celebMeta(item)}
                      subscribed={subscribed.has(id)}
                      toggling={toggling.has(id)}
                      onToggle={(id) => toggleSubscribeTyped(id, 'celebrities')}
                    />
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
