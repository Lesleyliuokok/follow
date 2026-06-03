'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Plus, Loader2, User, Check,
  ExternalLink,
} from 'lucide-react'
import { SOCIAL_PLATFORM_LABELS } from '@/types'
import type { SocialPlatform } from '@prisma/client'
import { imgSrc } from '@/lib/img'

// ── Types ──────────────────────────────────────────────────────────────────

interface Platform {
  id: string
  platform: SocialPlatform
  platformId: string
  profileUrl: string
  username: string | null
  lastChecked: string | null
}

interface Celebrity {
  id: string
  name: string
  avatar: string | null
  platforms: Platform[]
}

// ── Platform badge colours ────────────────────────────────────────────────

const BADGE: Record<SocialPlatform, string> = {
  WEIBO: 'bg-orange-50 text-orange-600 border-orange-200',
  XIAOHONGSHU: 'bg-red-50 text-red-600 border-red-200',
  DOUYIN: 'bg-gray-900 text-white border-gray-900',
  BILIBILI: 'bg-sky-50 text-sky-600 border-sky-200',
}

const PLATFORM_ORDER: SocialPlatform[] = ['WEIBO', 'BILIBILI', 'XIAOHONGSHU', 'DOUYIN']
const ADDABLE: SocialPlatform[] = ['WEIBO', 'BILIBILI']

// ── Add Platform Modal ────────────────────────────────────────────────────

function AddPlatformModal({
  celebrityId,
  existing,
  onClose,
  onAdded,
}: {
  celebrityId: string
  existing: SocialPlatform[]
  onClose: () => void
  onAdded: () => void
}) {
  const available = ADDABLE.filter((p) => !existing.includes(p))
  const [platform, setPlatform] = useState<SocialPlatform>(available[0] ?? 'WEIBO')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch(`/api/celebrities/${celebrityId}/platforms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, url }),
    })
    setLoading(false)
    if (res.ok) {
      onAdded()
      onClose()
    } else {
      const j = await res.json().catch(() => ({}))
      setError((j as { error?: string }).error ?? '添加失败')
    }
  }

  const placeholder =
    platform === 'WEIBO'
      ? 'https://weibo.com/u/1234567890  或  UID 数字'
      : 'https://space.bilibili.com/1234567  或  UID 数字'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900 mb-4">添加平台账号</h3>
        <form onSubmit={submit} className="space-y-4">
          {/* Platform selector */}
          <div className="flex gap-2">
            {available.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  platform === p
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {SOCIAL_PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {/* URL / UID input */}
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
            autoFocus
          />

          {platform === 'WEIBO' && (
            <p className="text-xs text-gray-400 leading-relaxed">
              打开微博网页版，进入该艺人官方主页 → 地址栏会显示
              <span className="font-mono bg-gray-100 px-1 rounded">weibo.com/u/1234567890</span>
              这样的 UID 格式链接，复制粘贴即可。
            </p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!url.trim() || loading}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              确认添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CelebrityPage() {
  const { id } = useParams<{ id: string }>()

  const [celebrity, setCelebrity] = useState<Celebrity | null>(null)
  const [isFollowed, setIsFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [celebRes, subsRes] = await Promise.all([
      fetch(`/api/celebrities/${id}`),
      fetch('/api/subscriptions'),
    ])

    if (!celebRes.ok) {
      setCelebrity(null)
      setLoading(false)
      return
    }

    const celeb = await celebRes.json() as Celebrity
    if (!Array.isArray(celeb.platforms)) celeb.platforms = []

    const subs: { celebrityId?: string }[] = await subsRes.json().catch(() => [])

    setCelebrity(celeb)
    setIsFollowed(subs.some((s) => s.celebrityId === id))
    setLoading(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function toggleFollow() {
    setFollowLoading(true)
    const body = isFollowed
      ? { celebrityId: id }
      : {
          // Pass name + avatar so the server can self-heal if the celebrity ID isn't
          // immediately visible on Neon (brief replication lag on free tier)
          celebrityId: id,
          name: celebrity?.name,
          avatar: celebrity?.avatar,
        }
    await fetch('/api/subscriptions', {
      method: isFollowed ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setIsFollowed((v) => !v)
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!celebrity) {
    return <div className="text-center py-20 text-gray-400">艺人不存在</div>
  }

  const existingPlatforms = celebrity.platforms.map((p) => p.platform)
  const canAddMore = ADDABLE.some((p) => !existingPlatforms.includes(p))

  const sortedPlatforms = [...celebrity.platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href="/subscriptions"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        返回追踪
      </Link>

      {/* Hero */}
      <div className="flex items-start gap-6 mb-8">
        {/* Avatar */}
        <div className="relative w-24 h-24 flex-shrink-0 rounded-full overflow-hidden bg-gray-100 shadow-md">
          {celebrity.avatar ? (
            <Image src={imgSrc(celebrity.avatar)!} alt={celebrity.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex items-center justify-center h-full">
              <User size={32} className="text-gray-300" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 pt-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{celebrity.name}</h1>

          {/* Platform badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {sortedPlatforms.map((cp) => (
              <div key={cp.id} className="group relative flex items-center">
                <a
                  href={cp.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border hover:opacity-80 transition-opacity ${BADGE[cp.platform]}`}
                >
                  {SOCIAL_PLATFORM_LABELS[cp.platform]}
                  <ExternalLink size={10} />
                </a>
                <button
                  onClick={async () => {
                    if (!confirm(`确认删除 ${SOCIAL_PLATFORM_LABELS[cp.platform]} 平台账号？`)) return
                    await fetch(`/api/celebrities/${id}/platforms`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ platform: cp.platform }),
                    })
                    load()
                  }}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none hover:bg-red-600 transition-colors"
                  title="删除此平台"
                >
                  ✕
                </button>
              </div>
            ))}
            {canAddMore && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
              >
                <Plus size={12} />
                添加平台
              </button>
            )}
          </div>

          {/* Follow button */}
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isFollowed
                ? 'bg-green-50 text-green-600 border border-green-100 hover:bg-red-50 hover:text-red-500 hover:border-red-100'
                : 'bg-gray-900 text-white hover:bg-gray-700'
            }`}
          >
            {followLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isFollowed ? (
              <Check size={14} />
            ) : (
              <Plus size={14} />
            )}
            {isFollowed ? '已追踪' : '追踪动态'}
          </button>
        </div>
      </div>

      {/* Add Platform Modal */}
      {showModal && (
        <AddPlatformModal
          celebrityId={id}
          existing={existingPlatforms}
          onClose={() => setShowModal(false)}
          onAdded={load}
        />
      )}
    </div>
  )
}
