const crypto = require('crypto')
const config = require('../config')

/**
 * Vérifie Bearer token admin (timing-safe)
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token admin requis' })
  }
  const token = authHeader.slice(7)
  try {
    const tokenBuf = Buffer.from(token, 'utf8')
    const expectedBuf = Buffer.from(config.adminToken, 'utf8')
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return res.status(403).json({ error: 'Token admin invalide' })
    }
  } catch {
    return res.status(403).json({ error: 'Token admin invalide' })
  }
  next()
}

module.exports = { adminAuth }
