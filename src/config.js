require('dotenv').config()

// Refuser de démarrer en production avec les secrets par défaut
if (process.env.NODE_ENV === 'production') {
  if (!process.env.API_SECRET || process.env.API_SECRET === 'dev-secret') {
    console.error('FATAL: API_SECRET non défini ou valeur par défaut en production!')
    process.exit(1)
  }
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN === 'dev-admin-token') {
    console.error('FATAL: ADMIN_TOKEN non défini ou valeur par défaut en production!')
    process.exit(1)
  }
}

module.exports = {
  port: process.env.PORT || 3456,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  apiSecret: process.env.API_SECRET || 'dev-secret',
  adminToken: process.env.ADMIN_TOKEN || 'dev-admin-token',
  paydunya: {
    masterKey: process.env.PAYDUNYA_MASTER_KEY || '',
    privateKey: process.env.PAYDUNYA_PRIVATE_KEY || '',
    publicKey: process.env.PAYDUNYA_PUBLIC_KEY || '',
    token: process.env.PAYDUNYA_TOKEN || '',
    mode: process.env.PAYDUNYA_MODE || 'test',
    get baseUrl() {
      return this.mode === 'live'
        ? 'https://app.paydunya.com/api/v1'
        : 'https://app.paydunya.com/sandbox-api/v1'
    }
  },
  licencePrice: parseInt(process.env.LICENCE_PRICE || '5000', 10),
  licenceDurationDays: parseInt(process.env.LICENCE_DURATION_DAYS || '30', 10),
  serverUrl: process.env.SERVER_URL || 'http://localhost:3456',
  licencePrivateKey: process.env.LICENCE_PRIVATE_KEY
    ? Buffer.from(process.env.LICENCE_PRIVATE_KEY, 'base64').toString('utf-8')
    : null
}
