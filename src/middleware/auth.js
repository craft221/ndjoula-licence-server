const crypto = require('crypto')
const config = require('../config')

/**
 * Vérifie l'authentification de l'app desktop.
 * Supporte deux modes :
 *   1. HMAC signature (recommandé) : X-Timestamp + X-Signature headers
 *   2. API Key (rétrocompat) : X-API-Key header
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

    const expected = crypto.createHmac('sha256', config.apiSecret).update(timestamp).digest('hex')
    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return next()
    }
    return res.status(401).json({ error: 'Signature invalide' })
  }

  // Mode 2 : API Key directe (rétrocompat anciennes versions)
  const apiKey = req.headers['x-api-key']
  if (apiKey && apiKey === config.apiSecret) {
    return next()
  }

  return res.status(401).json({ error: 'Authentification requise' })
}

module.exports = { apiKeyAuth }
