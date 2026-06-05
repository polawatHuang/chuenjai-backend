const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const {
  receiveTranscript,
  callComplete,
  scheduleCall,
  listCalls,
  getTranscripts,
  getRiskScores,
  calculateRisk,
} = require('../controllers/voice.controller');

const router = Router();

// ── Voice Gateway webhooks (no JWT — authenticated via X-Webhook-Secret header)
router.post('/transcript',    receiveTranscript);
router.post('/call-complete', callComplete);

// ── Officer / scheduler endpoints (JWT protected)
router.post('/call',
  authenticateToken, requirePermission('voice_ai', 'create'), scheduleCall);

router.get('/calls',
  authenticateToken, requirePermission('voice_ai', 'view'), listCalls);

router.get('/calls/:id/transcripts',
  authenticateToken, requirePermission('voice_ai', 'view'), getTranscripts);

// ── Risk score endpoints
router.get('/risk-scores/:elderlyId',
  authenticateToken, requirePermission('elderlies', 'view'), getRiskScores);

router.post('/risk/calculate',
  authenticateToken, requirePermission('elderlies', 'update'), calculateRisk);

module.exports = router;
