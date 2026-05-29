'use client'

import { useState } from 'react'
import { Edit2, RefreshCw, Check, X, ExternalLink } from 'lucide-react'

interface Props {
  showId: string
  platformUrl: string
  platformLabel: string
}

export default function EditUrlButton({ showId, platformUrl, platformLabel }: Props) {
  const [mode, setMode] = useState<'idle' | 'editing' | 'refreshing'>('idle')
  const [value, setValue] = useState(platformUrl)
  const [savedUrl, setSavedUrl] = useState(platformUrl)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === savedUrl) { setMode('idle'); return }
    const res = await fetch(`/api/shows/${showId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformUrl: trimmed }),
    })
    if (res.ok) {
      setSavedUrl(trimmed)
      setMessage({ ok: true, text: '链接已更新' })
      setMode('idle')
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ ok: false, text: '保存失败' })
    }
  }

  async function refreshUrl() {
    setMode('refreshing')
    setMessage(null)
    const res = await fetch(`/api/shows/${showId}?action=refresh-url`)
    const json = await res.json()
    setMode('idle')
    if (json.ok && json.platformUrl) {
      setSavedUrl(json.platformUrl)
      setValue(json.platformUrl)
      setMessage({ ok: true, text: `链接已自动更新 → ${json.platformUrl}` })
    } else {
      setMessage({ ok: false, text: json.message ?? '自动匹配失败，请手动编辑' })
    }
    setTimeout(() => setMessage(null), 5000)
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-lg">
      {/* Current watch link */}
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={savedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <ExternalLink size={15} />
          去 {platformLabel} 观看
        </a>

        {/* Edit button */}
        {mode === 'idle' && (
          <>
            <button
              onClick={() => { setValue(savedUrl); setMode('editing') }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
              title="编辑链接"
            >
              <Edit2 size={12} />
              编辑链接
            </button>
            <button
              onClick={refreshUrl}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
              title="自动重新匹配链接"
            >
              <RefreshCw size={12} />
              重新匹配
            </button>
          </>
        )}

        {mode === 'refreshing' && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw size={12} className="animate-spin" />
            匹配中…
          </span>
        )}
      </div>

      {/* Inline edit row */}
      {mode === 'editing' && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setMode('idle') }}
            autoFocus
            placeholder="粘贴正确的页面链接，例如 https://v.qq.com/x/cover/XXX.html"
            className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-white"
          />
          <button
            onClick={save}
            className="flex items-center justify-center w-8 h-8 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0"
            title="保存"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => setMode('idle')}
            className="flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
            title="取消"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Feedback message */}
      {message && (
        <p className={`text-xs ${message.ok ? 'text-green-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
