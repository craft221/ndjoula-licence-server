const dns = require('dns')
const { Pool } = require('pg')
const config = require('../config')

const dbUrl = config.databaseUrl || process.env.DATABASE_URL

// Parse DATABASE_URL et forcer IPv4 via lookup custom
let poolConfig

if (dbUrl) {
  try {
    const url = new URL(dbUrl)
    poolConfig = {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.replace('/', ''),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
      connectionTimeoutMillis: 10000,
      // Force IPv4 lookup
      lookup: (hostname, options, callback) => {
        dns.resolve4(hostname, (err, addresses) => {
          if (err) return callback(err)
          callback(null, addresses[0], 4)
        })
      }
    }
    console.log('DB config: host=' + url.hostname + ', port=' + (url.port || 5432) + ', db=' + url.pathname.replace('/', ''))
  } catch (e) {
    console.error('DATABASE_URL invalide:', e.message)
    poolConfig = { connectionString: dbUrl, ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
  }
} else {
  console.error('ERREUR: DATABASE_URL non définie!')
  poolConfig = {}
}

const pool = new Pool(poolConfig)

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
