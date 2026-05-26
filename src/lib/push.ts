import webpush from 'web-push'
import { prisma } from '@/lib/db'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      ),
    ),
  )
  // Remove expired/invalid subscriptions
  const expired = subs.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r.reason as { statusCode?: number }).statusCode === 410
  })
  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expired.map((s) => s.endpoint) } },
    })
  }
}

export async function sendPushToSubscribers(
  showId?: string,
  celebrityId?: string,
  payload?: PushPayload,
) {
  if (!payload) return
  const subs = await prisma.subscription.findMany({
    where: { ...(showId ? { showId } : {}), ...(celebrityId ? { celebrityId } : {}), notifyPush: true },
    select: { userId: true },
  })
  const userIds = [...new Set(subs.map((s) => s.userId))]
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)))
}
