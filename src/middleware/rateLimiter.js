const rateLimit = require('express-rate-limit')

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false
})

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives de paiement, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false
})

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
})

module.exports = { apiLimiter, paymentLimiter, webhookLimiter }
