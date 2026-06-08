const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

// ── GET /api/v1/call-center/summary ──────────────────────────────────────────

const summary = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  const now        = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const last7d     = new Date(now); last7d.setDate(last7d.getDate() - 7);
  const last30d    = new Date(now); last30d.setDate(last30d.getDate() - 30);

  try {
    const [activeCalls, todayCalls, last7dCalls, recentCalls, aiConvs] =
      await Promise.all([
        // Live active calls (callStatus null = in-progress)
        prisma.call.findMany({
          where: { elderly: { organizationId: orgId }, callStatus: null },
          include: {
            elderly: { select: { id: true, firstName: true, lastName: true, phone: true } },
          },
          orderBy: { startedAt: 'desc' },
        }),

        // Today's all calls (for stats)
        prisma.call.findMany({
          where: { elderly: { organizationId: orgId }, createdAt: { gte: todayStart } },
          select: { callStatus: true, durationSeconds: true, callType: true, createdAt: true },
        }),

        // Last 7d completed calls (for success rate + hourly)
        prisma.call.findMany({
          where: { elderly: { organizationId: orgId }, createdAt: { gte: last7d } },
          select: { callStatus: true, callType: true, durationSeconds: true, createdAt: true },
        }),

        // Recent 40 completed calls
        prisma.call.findMany({
          where: { elderly: { organizationId: orgId }, callStatus: { not: null } },
          include: {
            elderly: { select: { id: true, firstName: true, lastName: true } },
            _count:  { select: { callTranscripts: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        }),

        // AI conversations last 7d (sentiment data)
        prisma.aiConversation.findMany({
          where: { elderly: { organizationId: orgId }, createdAt: { gte: last7d } },
          select: {
            callId: true, sentimentScore: true, lonelinessScore: true,
            depressionScore: true, summary: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    // ── Today stats ─────────────────────────────────────────────────────────
    const todayCompleted = todayCalls.filter(c => c.callStatus !== null);
    const successToday   = todayCalls.filter(c => c.callStatus === 'SUCCESS').length;
    const noAnswerToday  = todayCalls.filter(c => c.callStatus === 'NO_ANSWER').length;
    const durations      = todayCalls
      .filter(c => c.callStatus === 'SUCCESS' && c.durationSeconds)
      .map(c => c.durationSeconds);
    const avgDuration    = durations.length
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null;

    // ── 7-day success rate ───────────────────────────────────────────────────
    const last7dDone    = last7dCalls.filter(c => c.callStatus !== null);
    const last7dSuccess = last7dCalls.filter(c => c.callStatus === 'SUCCESS').length;
    const successRate7d = last7dDone.length
      ? parseFloat(((last7dSuccess / last7dDone.length) * 100).toFixed(1))
      : null;

    // ── Call type breakdown (7d) ─────────────────────────────────────────────
    const typeBreakdown = { MEDICATION: 0, HEALTH_CHECK: 0, APPOINTMENT: 0, EMERGENCY: 0 };
    for (const c of last7dCalls) {
      if (c.callType && typeBreakdown[c.callType] !== undefined) typeBreakdown[c.callType]++;
    }

    // ── Hourly distribution (today, 0-23) ────────────────────────────────────
    const hourlyMap = {};
    for (const c of todayCalls) {
      if (!c.createdAt) continue;
      const h = new Date(c.createdAt).getHours();
      if (!hourlyMap[h]) hourlyMap[h] = { hour: h, total: 0, success: 0 };
      hourlyMap[h].total++;
      if (c.callStatus === 'SUCCESS') hourlyMap[h].success++;
    }
    const hourlyDistribution = Array.from({ length: 24 }, (_, i) =>
      hourlyMap[i] ?? { hour: i, total: 0, success: 0 }
    );

    // ── Sentiment avg (7d) ───────────────────────────────────────────────────
    const sentScores = aiConvs
      .map(a => a.sentimentScore ? parseFloat(a.sentimentScore.toString()) : null)
      .filter(s => s !== null);
    const sentimentAvg7d = sentScores.length
      ? parseFloat((sentScores.reduce((s, v) => s + v, 0) / sentScores.length).toFixed(2))
      : null;

    // ── Build AI conv map keyed by callId ────────────────────────────────────
    const convByCallId = {};
    for (const a of aiConvs) {
      if (a.callId) convByCallId[a.callId.toString()] = a;
    }

    // ── Serialize active calls ───────────────────────────────────────────────
    function serializeCall(c) {
      return {
        id:              c.id.toString(),
        elderlyId:       c.elderlyId.toString(),
        elderlyName:     `${c.elderly?.firstName ?? ''} ${c.elderly?.lastName ?? ''}`.trim(),
        elderlyPhone:    c.elderly?.phone ?? null,
        callType:        c.callType,
        callStatus:      c.callStatus,
        durationSeconds: c.durationSeconds,
        startedAt:       c.startedAt,
        endedAt:         c.endedAt,
        createdAt:       c.createdAt,
        transcriptCount: c._count?.callTranscripts ?? 0,
        sentimentScore:  convByCallId[c.id.toString()]?.sentimentScore
          ? parseFloat(convByCallId[c.id.toString()].sentimentScore.toString())
          : null,
        hasSummary: !!(convByCallId[c.id.toString()]?.summary),
      };
    }

    return success(res, {
      stats: {
        activeCount:     activeCalls.length,
        totalToday:      todayCalls.length,
        successToday,
        noAnswerToday,
        failedToday:     todayCalls.filter(c => c.callStatus === 'FAILED').length,
        avgDurationSec:  avgDuration,
        successRate7d,
        sentimentAvg7d,
        last7dTotal:     last7dDone.length,
      },
      active:             activeCalls.map(serializeCall),
      recentCalls:        recentCalls.map(serializeCall),
      typeBreakdown,
      hourlyDistribution,
    });
  } catch (err) {
    console.error('[CallCenterController.summary]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch call center summary', 500);
  }
};

// ── GET /api/v1/call-center/call/:id ─────────────────────────────────────────

const callDetail = async (req, res) => {
  const callId = req.params.id;
  if (!/^\d+$/.test(callId)) return failure(res, 'VALIDATION_ERROR', 'Invalid call ID', 400);

  try {
    const call = await prisma.call.findFirst({
      where: {
        id:      BigInt(callId),
        elderly: { organizationId: BigInt(req.user.organizationId) },
      },
      include: {
        elderly:        { select: { id: true, firstName: true, lastName: true, phone: true } },
        callTranscripts: { orderBy: { createdAt: 'asc' } },
        aiConversations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!call) return failure(res, 'NOT_FOUND', 'Call not found', 404);

    const conv = call.aiConversations[0] ?? null;

    return success(res, {
      id:              call.id.toString(),
      elderlyId:       call.elderlyId.toString(),
      elderlyName:     `${call.elderly?.firstName ?? ''} ${call.elderly?.lastName ?? ''}`.trim(),
      elderlyPhone:    call.elderly?.phone ?? null,
      callType:        call.callType,
      callStatus:      call.callStatus,
      durationSeconds: call.durationSeconds,
      startedAt:       call.startedAt,
      endedAt:         call.endedAt,
      transcripts:     call.callTranscripts.map(t => ({
        id:             t.id.toString(),
        speaker:        t.speaker,
        transcript:     t.transcript,
        sentimentScore: t.sentimentScore ? parseFloat(t.sentimentScore.toString()) : null,
        confidenceScore:t.confidenceScore ? parseFloat(t.confidenceScore.toString()) : null,
        createdAt:      t.createdAt,
      })),
      aiSummary: conv ? {
        summary:          conv.summary,
        sentimentScore:   conv.sentimentScore   ? parseFloat(conv.sentimentScore.toString())   : null,
        lonelinessScore:  conv.lonelinessScore  ? parseFloat(conv.lonelinessScore.toString())  : null,
        depressionScore:  conv.depressionScore  ? parseFloat(conv.depressionScore.toString())  : null,
        riskScore:        conv.riskScore        ? parseFloat(conv.riskScore.toString())        : null,
        aiRecommendation: conv.aiRecommendation,
      } : null,
    });
  } catch (err) {
    console.error('[CallCenterController.callDetail]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch call detail', 500);
  }
};

module.exports = { summary, callDetail };
