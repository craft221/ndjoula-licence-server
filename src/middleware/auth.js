const config = require('../config')

/**
 * Vérifie X-API-Key header (authentification app desktop)
 */
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key']
  if (!apiKey || apiKey !== config.apiSecret) {
    return res.status(401).json({ error: 'Clé API invalide' })
  }
  next()
}

module.exports = { apiKeyAuth }
