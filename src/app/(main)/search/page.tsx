'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Search, Plus, Check, Tv, User } from 'lucide-react'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS } from '@/types'

type SearchMode = 'shows' | 'celebrities'

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('shows')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  async function handleSearch(q: string) {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const endpoint = mode === 'shows' ? `/api/shows?q=${encodeURIComponent(q)}` : `/api/celebrities?q=${encodeURIComponent(q)}`
      const res = await fetch(endpoint)
      setResults(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function toggleSubscribe(id: string) {
    const isSubscribed = subscribed.has(id)
    const body = mode === 'shows' ? { showId: id } : { celebrityId: id }
    await fetch('/api/subscriptions', {
      method: isSubscribed ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubscribed((prev) => {
      const next = new Set(prev)
      isSubscribed ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-4">搜索</h1>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
        {(['shows', 'celebrities'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResults([]) }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {m === 'shows' ? <Tv size={16} /> : <User size={16} />}
            {m === 'shows' ? '剧集' : '艺人'}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={mode === 'shows' ? '搜索剧名，如：低智商犯罪' : '搜索艺人，如：刘浩存'}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 transition-colors"
        />
      </div>

      {/* Results */}
      {loading && <p className="text-center text-gray-400 text-sm py-8">搜索中...</p>}
      <div className="flex flex-col gap-2">
        {results.map((item) => {
          const id = item.id as string
          const isSub = subscribed.has(id)
          return (
            <div key={id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
              <div className="relative w-12 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                {(item.coverImage || item.avatar) ? (
                  <Image src={(item.coverImage || item.avatar) as string} alt={item.title as string || item.name as string} fill className="object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300">
                    {mode === 'shows' ? <Tv size={20} /> : <User size={20} />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {(item.title || item.name) as string}
                </p>
                {mode === 'shows' && Boolean(item.platform) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS]}
                    {item.latestEpisode ? ` · 更新至第${String(item.latestEpisode)}集` : ''}
                  </p>
                )}
                {mode === 'celebrities' && Array.isArray(item.platforms) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(item.platforms as { platform: string }[]).map((p) => SOCIAL_PLATFORM_LABELS[p.platform as keyof typeof SOCIAL_PLATFORM_LABELS]).join(' · ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggleSubscribe(id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isSub ? 'bg-green-50 text-green-600' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSub ? <><Check size={14} />已追</> : <><Plus size={14} />追踪</>}
              </button>
            </div>
          )
        })}
      </div>
    </main>
  )
}
