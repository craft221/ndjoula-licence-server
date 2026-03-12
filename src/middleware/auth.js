const crypto = require('crypto')
const config = require('../config')

/**
 * Vérifie l'authentification de l'app desktop/mobile.
 * HMAC signature : X-Timestamp + X-Signature headers
 * Signe: METHOD\nPATH\nSHA256(body)\nTIMESTAMP
 */
function apiKeyAuth(req, res, next) {
  const timestamp = req.headers['x-timestamp']
  const signature = req.headers['x-signature']

  if (!timestamp || !signature) {
    return res.status(401).json({ error: 'Authentification requise (X-Timestamp + X-Signature)' })
  }

  const now = Math.floor(Date.now() / 1000)
  const reqTime = parseInt(timestamp, 10)

  // Tolérance de 5 minutes pour le décalage d'horloge
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 300) {
    return res.status(401).json({ error: 'Requête expirée ou timestamp invalide' })
  }

  // Reconstruire le message signé: METHOD\nPATH\nSHA256(body)\nTIMESTAMP
  const method = req.method.toUpperCase()
  const path = req.originalUrl.split('?')[0]
  const bodyStr = req.body ? JSON.stringify(req.body) : ''
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex')
  const message = `${method}\n${path}\n${bodyHash}\n${timestamp}`
  const expected = crypto.createHmac('sha256', config.apiSecret).update(message).digest('hex')

  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      return next()
    }
  } catch { /* invalid hex */ }

  return res.status(401).json({ error: 'Signature invalide' })
}

module.exports = { apiKeyAuth }
