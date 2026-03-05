const config = require('../config')

/**
 * Vérifie Bearer token admin
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token admin requis' })
  }
  const token = authHeader.slice(7)
  if (token !== config.adminToken) {
    return res.status(403).json({ error: 'Token admin invalide' })
  }
  next()
}

module.exports = { adminAuth }
