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

module.exports = router
