'use client'

import { useState } from 'react'
import { ShowUpdateCard } from './ShowUpdateCard'
import { SocialPostCard } from './SocialPostCard'
import type { TimelineItem } from '@/types'

// ── Date grouping (CST / UTC+8) ──────────────────────────────────────────────

const CST = 8 * 60 * 60 * 1000

function cstDateStr(d: Date): string {
  return new Date(d.getTime() + CST).toISOString().slice(0, 10)
}

function dateLabel(d: Date): string {
  const now = new Date()
  if (cstDateStr(d) === cstDateStr(now)) return '今天'
  if (cstDateStr(d) === cstDateStr(new Date(now.getTime() - 86_400_000))) return '昨天'
  const local = new Date(d.getTime() + CST)
  return `${local.getUTCMonth() + 1}月${local.getUTCDate()}日`
}

function groupByDate(items: TimelineItem[]) {
  type Group = { label: string; items: TimelineItem[] }
  const groups: Group[] = []
  for (const item of items) {
    const label = dateLabel(new Date(item.publishedAt))
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'shows' | 'celebs'

export function TimelineFeed({ items }: { items: TimelineItem[] }) {
  const [tab, setTab] = useState<Tab>('all')

  const showCount  = items.filter((i) => i.type === 'show_update').length
  const celebCount = items.filter((i) => i.type === 'social_post').length

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all',    label: '全部',   count: items.length },
    { key: 'shows',  label: '剧集更新', count: showCount  },
    { key: 'celebs', label: '艺人动态', count: celebCount },
  ]

  const filtered = items.filter((item) => {
    if (tab === 'shows')  return item.type === 'show_update'
    if (tab === 'celebs') return item.type === 'social_post'
    return true
  })

  const groups = groupByDate(filtered)

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full leading-none ${
                tab === key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-sm">
            暂无{tab === 'shows' ? '剧集更新' : tab === 'celebs' ? '艺人动态' : '更新'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="flex flex-col gap-3">
                {group.items.map((item) =>
                  item.type === 'show_update' && item.show ? (
                    <ShowUpdateCard
                      key={item.id}
                      show={item.show}
                      episode={item.episode!}
                      episodeTitle={item.episodeTitle}
                      publishedAt={item.publishedAt}
                    />
                  ) : item.type === 'social_post' && item.celebrity ? (
                    <SocialPostCard
                      key={item.id}
                      celebrity={item.celebrity}
                      socialPlatform={item.socialPlatform!}
                      content={item.content}
                      mediaUrls={item.mediaUrls}
                      postUrl={item.postUrl}
                      publishedAt={item.publishedAt}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
