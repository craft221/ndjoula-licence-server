const dns = require('dns')
// Force IPv4 - Railway ne supporte pas IPv6 vers Supabase
dns.setDefaultResultOrder('ipv4first')

const { Pool } = require('pg')
const config = require('../config')

const dbUrl = config.databaseUrl || process.env.DATABASE_URL

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
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
