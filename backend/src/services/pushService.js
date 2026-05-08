const webpush = require('web-push')
const prisma  = require('../lib/prisma')

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_USER || 'app@financaspro.com.br'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  vapidConfigured = true
  return true
}

async function sendPushToUser(userId, payload) {
  if (!ensureVapid()) return

  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  if (!subs.length) return

  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } })
        }
      })
    )
  )
}

module.exports = { sendPushToUser }
