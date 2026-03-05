const { Router } = require('express')
const { pool } = require('../database/connection')

const router = Router()

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database non disponible' })
  }
})

module.exports = router
