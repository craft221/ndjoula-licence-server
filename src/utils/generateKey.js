const crypto = require('crypto')

/**
 * Génère une clé de licence au format CMRC-XXXX-XXXX-XXXX
 * Caractères : A-Z, 0-9
 */
function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans I, O, 0, 1 pour éviter confusion
  let segment = () => {
    let s = ''
    for (let i = 0; i < 4; i++) {
      const idx = crypto.randomInt(0, chars.length)
      s += chars[idx]
    }
    return s
  }
  return `CMRC-${segment()}-${segment()}-${segment()}`
}

module.exports = { generateKey }
