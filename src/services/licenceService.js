const crypto = require('crypto')
const { query } = require('../database/connection')
const { generateKey } = require('../utils/generateKey')
const config = require('../config')

async function createLicence({ client_name, phone }) {
  // Retry en cas de collision de clé (très rare)
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = generateKey()
    try {
      const result = await query(
        `INSERT INTO licences (licence_key, client_name, phone, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [key, client_name || '', phone || '']
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
  // On compare avec le champ phone de la licence (le numéro du patron)
  if (licence.phone && normalizedPhone) {
    const licencePhone = normalizePhone(licence.phone)
    if (licencePhone && licencePhone !== normalizedPhone) {
      return { valid: false, reason: 'Cette licence est liée à un autre compte.' }
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

// Normalise un numéro de téléphone : garde uniquement les chiffres et le +
function normalizePhone(phone) {
  if (!phone) return ''
  return phone.replace(/[\s\-().]/g, '')
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

  // Chercher la licence active la plus récente pour ce numéro
  const result = await query(
    `SELECT * FROM licences
     WHERE phone = $1 AND status = 'active'
     ORDER BY expiration_date DESC LIMIT 1`,
    [normalizedPhone]
  )
  if (result.rows[0]) return result.rows[0]

  // Essayer aussi avec le numéro tel quel (sans normalisation)
  const result2 = await query(
    `SELECT * FROM licences
     WHERE phone = $1 AND status = 'active'
     ORDER BY expiration_date DESC LIMIT 1`,
    [phone]
  )
  return result2.rows[0] || null
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
