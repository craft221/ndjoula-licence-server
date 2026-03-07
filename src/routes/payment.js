const { Router } = require('express')
const { query } = require('../database/connection')
const licenceService = require('../services/licenceService')
const paydunyaService = require('../services/paydunyaService')
const { apiKeyAuth } = require('../middleware/auth')
const { paymentLimiter, webhookLimiter } = require('../middleware/rateLimiter')
const config = require('../config')

const router = Router()

/**
 * POST /api/payment/register
 * Body: { client_name, phone, payment_method }
 * Crée une licence liée au téléphone du patron + lance le paiement
 * Le client n'a pas besoin d'une clé pré-existante
 */
router.post('/register', apiKeyAuth, paymentLimiter, async (req, res) => {
  try {
    const { client_name, phone, payment_method } = req.body
    if (!client_name || !phone || !payment_method) {
      return res.status(400).json({ error: 'client_name, phone et payment_method requis' })
    }

    // Créer la licence (statut pending, liée au phone du patron)
    const licence = await licenceService.createLicence({ client_name, phone })

    // Créer la facture PayDunya
    const invoice = await paydunyaService.createInvoice({
      licenceKey: licence.licence_key,
      clientName: client_name,
      phone,
      amount: config.licencePrice
    })

    // Enregistrer le paiement en DB
    await query(
      `INSERT INTO payments (licence_id, paydunya_token, amount, payment_method, status, customer_phone)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [licence.id, invoice.token, config.licencePrice, payment_method, phone]
    )

    // Déclencher le SoftPay (paiement direct via mobile money)
    let softPayResult = null
    let softPayFailed = false
    try {
      softPayResult = await paydunyaService.softPay(invoice.token, payment_method, phone)
    } catch (spErr) {
      console.error('Erreur SoftPay:', spErr.message)
      softPayFailed = true
    }

    // Toujours fournir une URL de paiement (SoftPay ou fallback facture)
    const paymentUrl = softPayResult?.payment_url || invoice.url || null

    res.json({
      success: true,
      licence_key: licence.licence_key,
      token: invoice.token,
      payment_url: paymentUrl,
      softpay_failed: softPayFailed,
      message: softPayFailed
        ? 'Licence créée. Le paiement direct a échoué, utilisez le lien de paiement.'
        : 'Licence créée. Veuillez compléter le paiement.'
    })
  } catch (err) {
    console.error('Erreur register:', err)
    res.status(500).json({ error: 'Erreur lors de la création' })
  }
})

/**
 * POST /api/payment/initiate
 * Body: { licence_key, payment_method, phone }
 * Crée une facture PayDunya pour une licence existante (renouvellement)
 */
router.post('/initiate', apiKeyAuth, paymentLimiter, async (req, res) => {
  try {
    const { licence_key, payment_method, phone } = req.body
    if (!licence_key || !payment_method || !phone) {
      return res.status(400).json({ error: 'licence_key, payment_method et phone requis' })
    }

    const licence = await licenceService.getLicenceByKey(licence_key)
    if (!licence) {
      return res.status(404).json({ error: 'Licence non trouvée' })
    }

    // Créer la facture PayDunya
    const invoice = await paydunyaService.createInvoice({
      licenceKey: licence_key,
      clientName: licence.client_name,
      phone,
      amount: config.licencePrice
    })

    // Enregistrer le paiement en DB
    await query(
      `INSERT INTO payments (licence_id, paydunya_token, amount, payment_method, status, customer_phone)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [licence.id, invoice.token, config.licencePrice, payment_method, phone]
    )

    // Déclencher le SoftPay (paiement direct via mobile money)
    let softPayResult = null
    let softPayFailed = false
    try {
      softPayResult = await paydunyaService.softPay(invoice.token, payment_method, phone)
    } catch (spErr) {
      console.error('Erreur SoftPay:', spErr.message)
      softPayFailed = true
    }

    const paymentUrl = softPayResult?.payment_url || invoice.url || null

    res.json({
      success: true,
      token: invoice.token,
      payment_url: paymentUrl,
      softpay_failed: softPayFailed,
      message: softPayFailed
        ? 'Le paiement direct a échoué, utilisez le lien de paiement.'
        : 'Facture créée. Veuillez compléter le paiement.'
    })
  } catch (err) {
    console.error('Erreur initiation paiement:', err)
    res.status(500).json({ error: 'Erreur lors de la création du paiement' })
  }
})

/**
 * POST /api/payment/webhook
 * Callback IPN PayDunya — vérifie le hash et active/renouvelle la licence
 */
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const { data } = req.body

    // Vérifier le hash
    if (!data || !data.hash || !paydunyaService.verifyIPNHash(data.hash)) {
      console.error('Webhook: hash invalide')
      return res.status(403).json({ error: 'Hash invalide' })
    }

    const invoiceData = data.invoice || {}
    const token = invoiceData.token || data.token
    const status = data.status || invoiceData.status

    if (!token) {
      return res.status(400).json({ error: 'Token manquant' })
    }

    // Trouver le paiement en DB
    const paymentResult = await query(
      'SELECT * FROM payments WHERE paydunya_token = $1',
      [token]
    )
    const payment = paymentResult.rows[0]
    if (!payment) {
      console.error('Webhook: paiement non trouvé pour token', token)
      return res.status(404).json({ error: 'Paiement non trouvé' })
    }

    if (status === 'completed') {
      // Mettre à jour le paiement
      await query(
        `UPDATE payments SET status = 'completed', completed_at = NOW(), paydunya_data = $1
         WHERE id = $2`,
        [JSON.stringify(data), payment.id]
      )

      // Activer/renouveler la licence
      await licenceService.activateLicence(payment.licence_id, config.licenceDurationDays)

      console.log(`Licence ${payment.licence_id} activée via webhook`)
    } else if (status === 'failed' || status === 'cancelled') {
      await query(
        `UPDATE payments SET status = $1, paydunya_data = $2 WHERE id = $3`,
        [status, JSON.stringify(data), payment.id]
      )
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Erreur webhook:', err)
    res.status(500).json({ error: 'Erreur traitement webhook' })
  }
})

/**
 * GET /api/payment/status/:token
 * Polling du statut de paiement par l'app desktop
 */
router.get('/status/:token', apiKeyAuth, async (req, res) => {
  try {
    const { token } = req.params

    // Vérifier en DB d'abord
    const paymentResult = await query(
      'SELECT p.*, l.licence_key, l.status as licence_status, l.expiration_date FROM payments p LEFT JOIN licences l ON p.licence_id = l.id WHERE p.paydunya_token = $1',
      [token]
    )
    const payment = paymentResult.rows[0]
    if (!payment) {
      return res.status(404).json({ error: 'Paiement non trouvé' })
    }

    // Si toujours pending, vérifier chez PayDunya
    if (payment.status === 'pending') {
      try {
        const paydunyaStatus = await paydunyaService.checkInvoiceStatus(token)
        if (paydunyaStatus.status === 'completed') {
          await query(
            `UPDATE payments SET status = 'completed', completed_at = NOW(), paydunya_data = $1 WHERE id = $2`,
            [JSON.stringify(paydunyaStatus.data), payment.id]
          )
          await licenceService.activateLicence(payment.licence_id, config.licenceDurationDays)
          payment.status = 'completed'
        }
      } catch (checkErr) {
        // Pas critique — on retourne le statut DB
      }
    }

    // Re-fetch licence data to get updated expiration_date after activation
    let licenceData = { licence_key: payment.licence_key, status: payment.licence_status, expiration_date: payment.expiration_date }
    if (payment.status === 'completed') {
      const freshLicence = await licenceService.getLicenceById(payment.licence_id)
      if (freshLicence) {
        licenceData = { licence_key: freshLicence.licence_key, status: freshLicence.status, expiration_date: freshLicence.expiration_date }
      }
    }

    res.json({
      status: payment.status,
      licence_key: licenceData.licence_key,
      licence_status: licenceData.status,
      expiration_date: licenceData.expiration_date
    })
  } catch (err) {
    console.error('Erreur statut paiement:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * GET /api/payment/return
 * Page HTML simple après paiement
 */
router.get('/return', (req, res) => {
  const cancelled = req.query.status === 'cancelled'
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ndjoula - Paiement</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: white; border-radius: 16px; padding: 48px; max-width: 400px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    h1 { color: ${cancelled ? '#ef4444' : '#1e3a5f'}; }
    p { color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${cancelled ? 'Paiement annulé' : 'Paiement reçu !'}</h1>
    <p>${cancelled
      ? 'Le paiement a été annulé. Vous pouvez réessayer depuis l\'application Ndjoula.'
      : 'Votre paiement a été reçu. Retournez à l\'application Ndjoula — votre licence sera activée automatiquement.'
    }</p>
  </div>
</body>
</html>`
  res.send(html)
})

module.exports = router
