const crypto = require('crypto')
const config = require('../config')

/**
 * Vérifie l'authentification de l'app desktop/mobile.
 * Supporte deux modes :
 *   1. HMAC signature (recommandé) : X-Timestamp + X-Signature headers
 *      Signe: METHOD\nPATH\nSHA256(body)\nTIMESTAMP
 *   2. API Key (rétrocompat anciennes versions) : X-API-Key header
 */
function apiKeyAuth(req, res, next) {
  const timestamp = req.headers['x-timestamp']
  const signature = req.headers['x-signature']

  // Mode 1 : Signature HMAC (le secret n'est jamais envoyé)
  if (timestamp && signature) {
    const now = Math.floor(Date.now() / 1000)
    const reqTime = parseInt(timestamp, 10)

    // Tolérance de 5 minutes pour le décalage d'horloge
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 300) {
      return res.status(401).json({ error: 'Requête expirée ou timestamp invalide' })
    }

    // Reconstruire le message signé: METHOD\nPATH\nSHA256(body)\nTIMESTAMP
    const method = req.method.toUpperCase()
    const path = req.originalUrl.split('?')[0] // Remove query string
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
    } catch { /* invalid hex, fall through */ }

    // Fallback: essayer l'ancien format (timestamp seul) pour rétrocompat temporaire
    const legacyExpected = crypto.createHmac('sha256', config.apiSecret).update(timestamp).digest('hex')
    try {
      const sigBuf = Buffer.from(signature, 'hex')
      const legBuf = Buffer.from(legacyExpected, 'hex')
      if (sigBuf.length === legBuf.length && crypto.timingSafeEqual(sigBuf, legBuf)) {
        return next()
      }
    } catch { /* invalid hex */ }

    return res.status(401).json({ error: 'Signature invalide' })
  }

  // Mode 2 : API Key directe (rétrocompat anciennes versions)
  const apiKey = req.headers['x-api-key']
  if (apiKey) {
    try {
      const keyBuf = Buffer.from(apiKey, 'utf8')
      const expectedBuf = Buffer.from(config.apiSecret, 'utf8')
      if (keyBuf.length === expectedBuf.length && crypto.timingSafeEqual(keyBuf, expectedBuf)) {
        return next()
      }
    } catch { /* fall through to 401 */ }
  }

  return res.status(401).json({ error: 'Authentification requise' })
}

module.exports = { apiKeyAuth }
