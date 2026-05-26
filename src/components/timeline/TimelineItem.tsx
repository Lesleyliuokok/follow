'use client'

import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ExternalLink, Play, Tv } from 'lucide-react'
import type { TimelineItem as TTimelineItem } from '@/types'
import { PLATFORM_LABELS, SOCIAL_PLATFORM_LABELS, PLATFORM_COLORS } from '@/types'

export function TimelineItem({ item }: { item: TTimelineItem }) {
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: zhCN })

  if (item.type === 'show_update' && item.show) {
    const color = PLATFORM_COLORS[item.show.platform]
    return (
      <div className="flex gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="relative w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
          {item.show.coverImage ? (
            <Image src={item.show.coverImage} alt={item.show.title} fill className="object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Tv size={24} className="text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              {PLATFORM_LABELS[item.show.platform]}
            </span>
            <span className="text-xs text-gray-400">{timeAgo}</span>
          </div>
          <p className="font-semibold text-gray-900 truncate">{item.show.title}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            第 {item.episode} 集{item.episodeTitle ? `：${item.episodeTitle}` : ''} 已更新
          </p>
          <a
            href={item.show.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <Play size={12} />
            立即观看
          </a>
        </div>
      </div>
    )
  }

  if (item.type === 'social_post' && item.celebrity) {
    return (
      <div className="p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-gray-100">
            {item.celebrity.avatar ? (
              <Image src={item.celebrity.avatar} alt={item.celebrity.name} fill className="object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-lg font-bold">
                {item.celebrity.name[0]}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">{item.celebrity.name}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {item.socialPlatform && SOCIAL_PLATFORM_LABELS[item.socialPlatform]}
              </span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">{timeAgo}</span>
            </div>
          </div>
          {item.postUrl && (
            <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
        {item.content && (
          <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{item.content}</p>
        )}
        {item.mediaUrls && item.mediaUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
            {item.mediaUrls.slice(0, 3).map((url, i) => (
              <div key={i} className="relative aspect-square bg-gray-100">
                <Image src={url} alt="" fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
