const { Router } = require('express')
const licenceService = require('../services/licenceService')
const { adminAuth } = require('../middleware/adminAuth')
const { apiLimiter } = require('../middleware/rateLimiter')

const router = Router()

router.use(adminAuth)
router.use(apiLimiter)

/**
 * POST /api/admin/licences
 * Créer une nouvelle licence
 */
router.post('/licences', async (req, res) => {
  try {
    const { client_name, phone } = req.body
    const licence = await licenceService.createLicence({ client_name, phone })
    res.status(201).json(licence)
  } catch (err) {
    console.error('Erreur création licence:', err)
    res.status(500).json({ error: 'Erreur lors de la création de la licence' })
  }
})

/**
 * GET /api/admin/licences
 * Lister toutes les licences
 */
router.get('/licences', async (req, res) => {
  try {
    const licences = await licenceService.getAllLicences()
    res.json(licences)
  } catch (err) {
    console.error('Erreur liste licences:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * GET /api/admin/licences/:id
 * Détails d'une licence
 */
router.get('/licences/:id', async (req, res) => {
  try {
    const licence = await licenceService.getLicenceById(parseInt(req.params.id))
    if (!licence) return res.status(404).json({ error: 'Licence non trouvée' })
    res.json(licence)
  } catch (err) {
    console.error('Erreur détail licence:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * PUT /api/admin/licences/:id
 * Mettre à jour une licence
 */
router.put('/licences/:id', async (req, res) => {
  try {
    const licence = await licenceService.updateLicence(parseInt(req.params.id), req.body)
    if (!licence) return res.status(404).json({ error: 'Licence non trouvée' })
    res.json(licence)
  } catch (err) {
    console.error('Erreur mise à jour licence:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /api/admin/licences/:id/activate
 * Activer manuellement une licence (admin)
 */
router.post('/licences/:id/activate', async (req, res) => {
  try {
    const { duration_days } = req.body
    const licence = await licenceService.activateLicence(parseInt(req.params.id), duration_days)
    if (!licence) return res.status(404).json({ error: 'Licence non trouvée' })
    res.json(licence)
  } catch (err) {
    console.error('Erreur activation licence:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * GET /api/admin/stats
 * Statistiques globales
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await licenceService.getStats()
    res.json(stats)
  } catch (err) {
    console.error('Erreur stats:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

module.exports = router
