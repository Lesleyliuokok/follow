'use client'

import { useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'

interface Props {
  showId: string
  initialFollowed: boolean
}

export default function FollowButton({ showId, initialFollowed }: Props) {
  const [followed, setFollowed] = useState(initialFollowed)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions', {
        method: followed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId }),
      })
      if (res.ok) setFollowed((v) => !v)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 ${
        followed
          ? 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
          : 'bg-gray-900 text-white hover:bg-gray-700'
      }`}
    >
      {loading ? (
        <Loader2 size={15} className="animate-spin" />
      ) : followed ? (
        <BellOff size={15} />
      ) : (
        <Bell size={15} />
      )}
      {followed ? '已追踪' : '追踪更新'}
    </button>
  )
}
