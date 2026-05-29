import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <svg width="132" height="40" viewBox="0 0 196 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="2" width="36" height="56" rx="8" stroke="#111827" strokeWidth="3"/>
            <rect x="14" y="8" width="14" height="3" rx="1.5" fill="#111827"/>
            <rect x="17" y="48" width="8" height="3" rx="1.5" fill="#111827"/>
            <path d="M21 37 C21 37 10 29 10 23 C10 18.5 13 16 17 17 C19 17.5 20.5 19 21 21 C21.5 19 23 17.5 25 17 C29 16 32 18.5 32 23 C32 29 21 37 21 37Z" fill="#E53E3E"/>
            <text x="50" y="40" fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="32" fill="#111827" letterSpacing="-0.5">Follow</text>
          </svg>
          <p className="text-gray-500 mt-3 text-sm">追剧 · 追综 · 追艺人</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-4">
          <p className="text-center text-gray-500 text-sm">登录以开始追踪更新</p>

          {/* WeChat login — requires WECHAT_OPEN_APP_ID to be configured */}
          {process.env.WECHAT_OPEN_APP_ID && (
            <form
              action={async () => {
                'use server'
                await signIn('wechat', { redirectTo: '/search' })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059A4C] text-white font-medium py-3.5 px-4 rounded-xl transition-colors shadow-sm"
              >
                <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-3.895-6.348-7.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.063-6.122zm-3.934 3.038c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.905 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982z" />
                </svg>
                使用微信登录
              </button>
            </form>
          )}

          {/* Google login */}
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/search' })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium py-3.5 px-4 rounded-xl border border-gray-200 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              使用 Google 登录
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 leading-relaxed">
            首次登录将自动创建账号
          </p>
        </div>
      </div>
    </div>
  )
}
