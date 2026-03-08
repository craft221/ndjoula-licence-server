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
 * SoftPay — déclencher le paiement selon la méthode
 */
async function softPay(token, method, phone) {
  const endpoints = {
    wave: '/softpay/wave-senegal',
    orange_money: '/softpay/new-orange-money-senegal',
    free_money: '/softpay/free-money-senegal'
  }

  const endpoint = endpoints[method]
  if (!endpoint) throw new Error(`Méthode de paiement non supportée: ${method}`)

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
  verifyIPNHash
}
