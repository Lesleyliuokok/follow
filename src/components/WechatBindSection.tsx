'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface Props {
  wechatOpenId: string | null
}

export function WechatBindSection({ wechatOpenId: initialOpenId }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [openId, setOpenId] = useState(initialOpenId)
  const [unbinding, setUnbinding] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Show feedback toast based on redirect query param
  useEffect(() => {
    const status = searchParams.get('wechat')
    if (!status) return
    if (status === 'bound') {
      setOpenId('bound') // optimistic — page will refresh with real value
      setToast({ msg: '微信绑定成功！今后剧集更新时将发送微信通知。', ok: true })
    } else if (status === 'cancelled') {
      setToast({ msg: '已取消绑定。', ok: false })
    } else if (status === 'error') {
      const reason = searchParams.get('reason')
      const msg =
        reason === 'already_bound'
          ? '该微信号已绑定其他账号，请先解绑。'
          : '绑定失败，请稍后重试。'
      setToast({ msg, ok: false })
    }
    // Remove query params without full refresh
    const url = new URL(window.location.href)
    url.searchParams.delete('wechat')
    url.searchParams.delete('reason')
    router.replace(url.pathname + url.search, { scroll: false })
  }, [searchParams, router])

  // Auto-dismiss toast after 5 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleUnbind() {
    if (!confirm('确认解除微信绑定？解绑后将不再收到微信通知。')) return
    setUnbinding(true)
    try {
      await fetch('/api/auth/wechat/unbind', { method: 'POST' })
      setOpenId(null)
      setToast({ msg: '微信已解绑。', ok: true })
    } finally {
      setUnbinding(false)
    }
  }

  const isBound = Boolean(openId)

  return (
    <section className="mt-10 pt-8 border-t border-gray-100">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
        通知设置
      </h2>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${
            toast.ok
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isBound ? 'bg-green-100' : 'bg-gray-100'
              }`}
            >
              <MessageCircle
                size={20}
                className={isBound ? 'text-green-600' : 'text-gray-400'}
              />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm">微信通知</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isBound
                  ? '已绑定 · 剧集更新时将推送微信模版消息'
                  : '绑定后，剧集更新时通过微信模版消息提醒你'}
              </p>
            </div>
          </div>

          {isBound ? (
            <button
              onClick={handleUnbind}
              disabled={unbinding}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
            >
              {unbinding && <Loader2 size={14} className="animate-spin" />}
              解绑
            </button>
          ) : (
            <a
              href="/api/auth/wechat"
              className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              绑定微信
            </a>
          )}
        </div>

        {!isBound && (
          <p className="mt-3 text-xs text-gray-400 leading-relaxed">
            💡 请在手机微信中打开此页面并点击"绑定微信"，或点击后在微信中扫码授权。
          </p>
        )}
      </div>
    </section>
  )
}
