const { Pool } = require('pg')
const config = require('../config')

const pool = new Pool({
  connectionString: config.databaseUrl
})

pool.on('error', (err) => {
  console.error('Erreur PostgreSQL inattendue:', err)
})

async function query(text, params) {
  const result = await pool.query(text, params)
  return result
}

async function getClient() {
  return pool.connect()
}

module.exports = { pool, query, getClient }
