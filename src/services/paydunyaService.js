const axios = require('axios')
const crypto = require('crypto')
const config = require('../config')

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': config.paydunya.masterKey,
    'PAYDUNYA-PRIVATE-KEY': config.paydunya.privateKey,
    'PAYDUNYA-TOKEN': config.paydunya.token
  }
}

/**
 * Crée une facture PayDunya
 */
async function createInvoice({ licenceKey, clientName, phone, amount }) {
  const invoiceData = {
    invoice: {
      total_amount: amount || config.licencePrice,
      description: `Licence Ndjoula - ${licenceKey}`
    },
    store: {
      name: 'Ndjoula',
      tagline: 'Gestion Commerciale',
      phone: '',
      website_url: config.serverUrl
    },
    custom_data: {
      licence_key: licenceKey,
      client_name: clientName || '',
      phone: phone || ''
    },
    actions: {
      callback_url: `${config.serverUrl}/api/payment/webhook`,
      return_url: `${config.serverUrl}/api/payment/return`,
      cancel_url: `${config.serverUrl}/api/payment/return?status=cancelled`
    }
  }

  const response = await axios.post(
    `${config.paydunya.baseUrl}/checkout-invoice/create`,
    invoiceData,
    { headers: getHeaders() }
  )

  if (response.data.response_code !== '00') {
    throw new Error(response.data.response_text || 'Erreur création facture PayDunya')
  }

  return {
    token: response.data.token,
    url: response.data.invoice_url || response.data.response_text || null
  }
}

/**
 * Endpoints SoftPay par pays et méthode de paiement
 * Clé: "{country_code}_{method}" ou "{method}" (fallback Sénégal)
 */
const SOFTPAY_ENDPOINTS = {
  // Sénégal (SN) — défaut
  'wave':              '/softpay/wave-senegal',
  'SN_wave':           '/softpay/wave-senegal',
  'SN_orange_money':   '/softpay/new-orange-money-senegal',
  'SN_free_money':     '/softpay/free-money-senegal',
  'orange_money':      '/softpay/new-orange-money-senegal',
  'free_money':        '/softpay/free-money-senegal',

  // Côte d'Ivoire (CI)
  'CI_wave':           '/softpay/wave-ci',
  'CI_orange_money':   '/softpay/orange-money-ci',
  'CI_mtn':            '/softpay/mtn-ci',
  'CI_moov':           '/softpay/moov-ci',

  // Mali (ML)
  'ML_orange_money':   '/softpay/orange-money-mali',
  'ML_moov':           '/softpay/moov-mali',

  // Burkina Faso (BF)
  'BF_orange_money':   '/softpay/orange-money-burkina',
  'BF_moov':           '/softpay/moov-burkina',

  // Togo (TG)
  'TG_t_money':        '/softpay/t-money-togo',
  'TG_moov':           '/softpay/moov-togo',

  // Bénin (BJ)
  'BJ_mtn':            '/softpay/mtn-benin',
  'BJ_moov':           '/softpay/moov-benin',

  // Cameroun (CM)
  'CM_mtn':            '/softpay/mtn-cameroun',
}

/**
 * Méthodes disponibles par pays
 */
const METHODS_BY_COUNTRY = {
  SN: ['wave', 'orange_money', 'free_money'],
  CI: ['wave', 'orange_money', 'mtn', 'moov'],
  ML: ['orange_money', 'moov'],
  BF: ['orange_money', 'moov'],
  TG: ['t_money', 'moov'],
  BJ: ['mtn', 'moov'],
  CM: ['mtn'],
}

function getAvailableMethods(countryCode) {
  return METHODS_BY_COUNTRY[countryCode] || METHODS_BY_COUNTRY['SN']
}

/**
 * SoftPay — déclencher le paiement selon la méthode et le pays
 * @param {string} token - Invoice token
 * @param {string} method - Payment method (wave, orange_money, free_money, mtn, moov, t_money)
 * @param {string} phone - Customer phone number
 * @param {string} [countryCode] - ISO country code (SN, CI, ML, BF, TG, BJ). Defaults to SN.
 */
async function softPay(token, method, phone, countryCode) {
  const country = countryCode || 'SN'

  // Try country-specific endpoint first, then generic fallback
  const endpoint = SOFTPAY_ENDPOINTS[`${country}_${method}`] || SOFTPAY_ENDPOINTS[method]
  if (!endpoint) {
    const available = getAvailableMethods(country)
    throw new Error(`Méthode "${method}" non disponible pour ${country}. Disponibles: ${available.join(', ')}`)
  }

  const payload = {
    invoice_token: token,
    customer_phone: phone
  }

  // Wave retourne une URL de paiement à ouvrir
  if (method === 'wave') {
    payload.payment_token = token
  }

  const response = await axios.post(
    `${config.paydunya.baseUrl}${endpoint}`,
    payload,
    { headers: getHeaders() }
  )

  return {
    success: response.data.response_code === '00',
    data: response.data,
    // Pour Wave, l'URL de paiement
    payment_url: response.data.wave_launch_url || response.data.payment_url || null
  }
}

/**
 * Vérifier le statut d'une facture
 */
async function checkInvoiceStatus(token) {
  const response = await axios.get(
    `${config.paydunya.baseUrl}/checkout-invoice/confirm/${token}`,
    { headers: getHeaders() }
  )

  return {
    status: response.data.status,
    data: response.data
  }
}

/**
 * Vérifier le hash IPN (webhook)
 * PayDunya envoie un hash SHA-512 du master_key
 */
function verifyIPNHash(receivedHash) {
  if (!config.paydunya.masterKey) return false
  const expectedHash = crypto
    .createHash('sha512')
    .update(config.paydunya.masterKey)
    .digest('hex')
  if (!receivedHash || receivedHash.length !== expectedHash.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(receivedHash, 'utf8'), Buffer.from(expectedHash, 'utf8'))
  } catch {
    return false
  }
}

module.exports = {
  createInvoice,
  softPay,
  checkInvoiceStatus,
  verifyIPNHash,
  getAvailableMethods,
  METHODS_BY_COUNTRY
}
