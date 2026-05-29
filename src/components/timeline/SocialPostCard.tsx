'use client'

import { useState } from 'react'
import Image from 'next/image'
import { imgSrc } from '@/lib/img'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { SOCIAL_PLATFORM_LABELS } from '@/types'
import type { SocialPlatform } from '@prisma/client'

interface SocialPostCardProps {
  celebrity: {
    id: string
    name: string
    avatar: string | null
  }
  socialPlatform: SocialPlatform
  content?: string | null
  mediaUrls?: string[]
  postUrl?: string
  publishedAt: Date | string
}

const PLATFORM_BADGE_COLORS: Record<SocialPlatform, string> = {
  WEIBO: 'bg-orange-50 text-orange-600',
  XIAOHONGSHU: 'bg-red-50 text-red-600',
  DOUYIN: 'bg-gray-900 text-white',
  BILIBILI: 'bg-sky-50 text-sky-600',
}

export function SocialPostCard({
  celebrity,
  socialPlatform,
  content,
  mediaUrls = [],
  postUrl,
  publishedAt,
}: SocialPostCardProps) {
  const [expanded, setExpanded] = useState(false)
  const timeAgo = formatDistanceToNow(new Date(publishedAt), { addSuffix: true, locale: zhCN })
  const isLong = (content?.length ?? 0) > 100

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
            {celebrity.avatar ? (
              <Image src={imgSrc(celebrity.avatar)!} alt={celebrity.name} fill className="object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-sm font-bold text-gray-400">
                {celebrity.name[0]}
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{celebrity.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${PLATFORM_BADGE_COLORS[socialPlatform]}`}>
                {SOCIAL_PLATFORM_LABELS[socialPlatform]}
              </span>
              <span className="text-xs text-gray-400">{timeAgo}</span>
            </div>
          </div>
        </div>
        {postUrl && (
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ExternalLink size={12} />
            查看原文
          </a>
        )}
      </div>

      {/* Content */}
      {content && (
        <div>
          <p className={`text-sm text-gray-700 leading-relaxed ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
            {content}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              {expanded ? <><ChevronUp size={12} />收起</> : <><ChevronDown size={12} />展开全文</>}
            </button>
          )}
        </div>
      )}

      {/* Images */}
      {mediaUrls.length > 0 && (
        <div className={`mt-3 grid gap-1 rounded-lg overflow-hidden ${
          mediaUrls.length === 1 ? 'grid-cols-1' :
          mediaUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
        }`}>
          {mediaUrls.slice(0, 9).map((url, i) => (
            <div key={i} className="relative aspect-square bg-gray-100">
              <Image src={url} alt="" fill className="object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
