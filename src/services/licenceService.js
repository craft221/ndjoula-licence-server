const crypto = require('crypto')
const { query } = require('../database/connection')
const { generateKey } = require('../utils/generateKey')
const config = require('../config')

async function createLicence({ client_name, phone }) {
  const normalizedPhone = phone ? normalizePhone(phone) : ''
  // Retry en cas de collision de clé (très rare)
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = generateKey()
    try {
      const result = await query(
        `INSERT INTO licences (licence_key, client_name, phone, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [key, client_name || '', normalizedPhone]
      )
      return result.rows[0]
    } catch (err) {
      if (err.code === '23505' && attempt < 4) continue // unique_violation, retry
      throw err
    }
  }
}

async function getLicenceByKey(key) {
  const result = await query('SELECT * FROM licences WHERE licence_key = $1', [key])
  return result.rows[0] || null
}

async function getLicenceById(id) {
  const result = await query('SELECT * FROM licences WHERE id = $1', [id])
  return result.rows[0] || null
}

async function getAllLicences() {
  const result = await query('SELECT * FROM licences ORDER BY created_at DESC')
  return result.rows
}

async function validateLicence(licenceKey, phoneOrMachineId) {
  const licence = await getLicenceByKey(licenceKey)
  if (!licence) {
    return { valid: false, reason: 'Clé de licence invalide' }
  }

  // Si la licence est en attente (première activation)
  if (licence.status === 'pending') {
    return { valid: false, reason: 'Licence non activée. Veuillez effectuer le paiement.' }
  }

  if (licence.status === 'suspended') {
    return { valid: false, reason: 'Licence suspendue. Contactez le support.' }
  }

  // Vérifier expiration
  if (licence.status === 'expired' || (licence.expiration_date && new Date(licence.expiration_date) < new Date())) {
    // Mettre à jour le statut si nécessaire
    if (licence.status !== 'expired') {
      await query('UPDATE licences SET status = $1 WHERE id = $2', ['expired', licence.id])
    }
    return {
      valid: false,
      reason: 'Licence expirée',
      licence_id: licence.id,
      licence_key: licence.licence_key,
      expiration_date: licence.expiration_date
    }
  }

  // Normaliser le numéro de téléphone pour la comparaison
  const normalizedPhone = normalizePhone(phoneOrMachineId)

  // Vérifier le binding par téléphone du patron
  // On compare les versions normalisées pour éviter les faux rejets (+221xx vs 221xx vs xx)
  if (licence.phone && normalizedPhone) {
    const licencePhoneNorm = normalizePhone(licence.phone)
    if (licencePhoneNorm && licencePhoneNorm !== normalizedPhone) {
      return { valid: false, reason: 'Cette licence est liée à un autre compte.' }
    }
    // Mettre à jour le numéro vers le format normalisé si différent
    if (licence.phone !== normalizedPhone) {
      await query('UPDATE licences SET phone = $1 WHERE id = $2', [normalizedPhone, licence.id])
    }
  }

  // Bind le téléphone au premier appel si pas encore défini
  if (!licence.phone && normalizedPhone) {
    await query('UPDATE licences SET phone = $1 WHERE id = $2', [normalizedPhone, licence.id])
  }

  // Mettre à jour last_check_at
  await query('UPDATE licences SET last_check_at = NOW() WHERE id = $1', [licence.id])

  const response = {
    valid: true,
    licence: {
      id: licence.id,
      licence_key: licence.licence_key,
      status: licence.status,
      expiration_date: licence.expiration_date,
      client_name: licence.client_name
    }
  }

  // Signer la réponse avec ED25519 si la clé privée est configurée
  // payload.m = phone du patron (au lieu de machine_id)
  if (config.licencePrivateKey) {
    const payload = JSON.stringify({
      l: licence.licence_key,
      m: normalizedPhone || licence.phone,
      s: licence.status,
      e: licence.expiration_date,
      t: new Date().toISOString()
    })
    const signature = crypto.sign(null, Buffer.from(payload), config.licencePrivateKey)
    response.signed_payload = payload
    response.signature = signature.toString('hex')
  }

  return response
}

// Préfixes téléphoniques par pays supportés
const COUNTRY_PREFIXES = ['221', '225', '237', '223', '224', '226', '228', '229', '33']

// Normalise un numéro de téléphone vers le format +XXX...
// Gère: +221785993392, 221785993392, 785993392 → +221785993392
function normalizePhone(phone) {
  if (!phone) return ''
  // Retirer espaces, tirets, parenthèses, points
  let cleaned = phone.replace(/[\s\-().]/g, '')
  // Retirer le + initial pour travailler avec les chiffres
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1)
  // Si le numéro commence par un préfixe pays connu, ajouter +
  for (const prefix of COUNTRY_PREFIXES) {
    if (cleaned.startsWith(prefix)) return '+' + cleaned
  }
  // Sinon c'est un numéro local → ajouter +221 par défaut (Sénégal)
  if (cleaned.length >= 7 && cleaned.length <= 10) return '+221' + cleaned
  return '+' + cleaned
}

async function getStatus(licenceKey) {
  const licence = await getLicenceByKey(licenceKey)
  if (!licence) return null

  // Vérifier et mettre à jour expiration
  if (licence.status === 'active' && licence.expiration_date && new Date(licence.expiration_date) < new Date()) {
    await query('UPDATE licences SET status = $1 WHERE id = $2', ['expired', licence.id])
    licence.status = 'expired'
  }

  await query('UPDATE licences SET last_check_at = NOW() WHERE id = $1', [licence.id])

  return {
    id: licence.id,
    licence_key: licence.licence_key,
    status: licence.status,
    expiration_date: licence.expiration_date,
    client_name: licence.client_name
  }
}

async function activateLicence(licenceId, durationDays) {
  const days = durationDays || config.licenceDurationDays
  const now = new Date()

  const licence = await getLicenceById(licenceId)
  if (!licence) return null

  // Si la licence est déjà active et non expirée, prolonger
  let baseDate = now
  if (licence && licence.status === 'active' && licence.expiration_date && new Date(licence.expiration_date) > now) {
    baseDate = new Date(licence.expiration_date)
  }

  const expiration = new Date(baseDate)
  expiration.setDate(expiration.getDate() + days)

  const result = await query(
    `UPDATE licences
     SET status = 'active',
         activation_date = COALESCE(activation_date, $1),
         expiration_date = $2,
         last_check_at = $1
     WHERE id = $3
     RETURNING *`,
    [now, expiration, licenceId]
  )
  return result.rows[0]
}

async function updateLicence(id, data) {
  const fields = []
  const values = []
  let idx = 1

  if (data.client_name !== undefined) { fields.push(`client_name = $${idx++}`); values.push(data.client_name) }
  if (data.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(data.phone) }
  if (data.status !== undefined) {
    const VALID_STATUSES = ['pending', 'active', 'expired', 'suspended']
    if (!VALID_STATUSES.includes(data.status)) {
      throw new Error(`Statut invalide: ${data.status}`)
    }
    fields.push(`status = $${idx++}`); values.push(data.status)
  }

  if (fields.length === 0) return getLicenceById(id)

  values.push(id)
  const result = await query(
    `UPDATE licences SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  )
  return result.rows[0]
}

async function getStats() {
  const total = await query('SELECT COUNT(*) as count FROM licences')
  const active = await query("SELECT COUNT(*) as count FROM licences WHERE status = 'active'")
  const expired = await query("SELECT COUNT(*) as count FROM licences WHERE status = 'expired'")
  const pending = await query("SELECT COUNT(*) as count FROM licences WHERE status = 'pending'")

  const revenue = await query(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'"
  )

  const expiringIn7Days = await query(
    `SELECT COUNT(*) as count FROM licences
     WHERE status = 'active'
       AND expiration_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
  )

  const recentPayments = await query(
    `SELECT p.*, l.licence_key, l.client_name
     FROM payments p
     LEFT JOIN licences l ON p.licence_id = l.id
     WHERE p.status = 'completed'
     ORDER BY p.completed_at DESC LIMIT 10`
  )

  return {
    total: parseInt(total.rows[0].count),
    active: parseInt(active.rows[0].count),
    expired: parseInt(expired.rows[0].count),
    pending: parseInt(pending.rows[0].count),
    revenue: parseInt(revenue.rows[0].total),
    expiringIn7Days: parseInt(expiringIn7Days.rows[0].count),
    recentPayments: recentPayments.rows
  }
}

async function findByPhone(phone) {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return null

  // Générer les variantes possibles du numéro pour matcher les anciens formats
  // Ex: +221785993392 → ['+221785993392', '221785993392', '785993392']
  const variants = new Set([normalizedPhone, phone])
  const digits = normalizedPhone.replace(/^\+/, '')
  variants.add(digits) // sans le +
  for (const prefix of COUNTRY_PREFIXES) {
    if (digits.startsWith(prefix)) {
      variants.add(digits.substring(prefix.length)) // numéro local seul
    }
  }

  // Chercher la licence la plus récente pour toutes les variantes
  const placeholders = Array.from(variants).map((_, i) => `$${i + 1}`).join(', ')
  const result = await query(
    `SELECT * FROM licences
     WHERE phone IN (${placeholders}) AND status IN ('active', 'expired')
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, expiration_date DESC
     LIMIT 1`,
    Array.from(variants)
  )
  return result.rows[0] || null
}

module.exports = {
  createLicence,
  getLicenceByKey,
  getLicenceById,
  getAllLicences,
  validateLicence,
  getStatus,
  activateLicence,
  updateLicence,
  getStats,
  findByPhone
}
