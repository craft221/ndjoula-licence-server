const { Router } = require('express')
const licenceService = require('../services/licenceService')
const { apiKeyAuth } = require('../middleware/auth')
const { apiLimiter } = require('../middleware/rateLimiter')

const router = Router()

router.use(apiKeyAuth)
router.use(apiLimiter)

/**
 * POST /api/licence/validate
 * Body: { licence_key, phone } (ou { licence_key, machine_id } pour rétrocompat)
 * Valide une clé de licence et lie au téléphone du patron
 */
router.post('/validate', async (req, res) => {
  try {
    const { licence_key, phone, machine_id } = req.body
    const identifier = phone || machine_id
    if (!licence_key || !identifier) {
      return res.status(400).json({ valid: false, reason: 'licence_key et phone requis' })
    }

    const result = await licenceService.validateLicence(licence_key, identifier)
    res.json(result)
  } catch (err) {
    console.error('Erreur validation licence:', err)
    res.status(500).json({ valid: false, reason: 'Erreur serveur' })
  }
})

/**
 * GET /api/licence/status/:key
 * Check léger pour ping périodique
 */
router.get('/status/:key', async (req, res) => {
  try {
    const licence = await licenceService.getStatus(req.params.key)
    if (!licence) {
      return res.status(404).json({ error: 'Licence non trouvée' })
    }
    res.json(licence)
  } catch (err) {
    console.error('Erreur statut licence:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /api/licence/find-by-phone
 * Body: { phone }
 * Cherche une licence active liée à ce numéro de téléphone
 * Utilisé quand un patron se connecte sur un nouvel appareil
 */
router.post('/find-by-phone', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) {
      return res.status(400).json({ found: false, reason: 'phone requis' })
    }

    const licence = await licenceService.findByPhone(phone)
    if (!licence) {
      return res.json({ found: false })
    }

    // Vérifier expiration
    if (licence.expiration_date && new Date(licence.expiration_date) < new Date()) {
      return res.json({
        found: true,
        expired: true,
        licence_key: licence.licence_key,
        expiration_date: licence.expiration_date
      })
    }

    return res.json({
      found: true,
      expired: false,
      licence_key: licence.licence_key,
      expiration_date: licence.expiration_date,
      client_name: licence.client_name
    })
  } catch (err) {
    console.error('Erreur find-by-phone:', err)
    res.status(500).json({ found: false, reason: 'Erreur serveur' })
  }
})

module.exports = router
