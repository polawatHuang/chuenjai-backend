'use strict';

const express = require('express');
const { handleLineWebhook } = require('../controllers/line-webhook.controller');

const router = express.Router();

// POST /webhook/line
// express.raw captures raw body for LINE signature verification
router.post('/line', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Expose raw body string for controller
  req.rawBody = req.body?.toString?.() ?? '';
  next();
}, handleLineWebhook);

module.exports = router;
