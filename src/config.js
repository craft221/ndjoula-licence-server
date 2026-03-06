require('dotenv').config()

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
