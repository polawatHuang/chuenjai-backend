/**
 * Voice AI Service
 *
 * Handles the full lifecycle of an AI-driven outbound health-check call:
 *
 *   1. processTurn()    — STT transcript in, OpenAI response + saved transcript out
 *   2. concludeCall()   — Post-call analysis: summary, sentiment, risk factors,
 *                         saved ai_conversations row, triggers Risk Engine
 *   3. detectEmergency()— Checks Thai emergency keywords in any transcript turn;
 *                         if positive the call is cut short and a CRITICAL alert fires
 *
 * ADD §7 Voice AI Flow:
 *   Scheduler → Call Queue → Voice Gateway → STT → OpenAI → TTS → Phone → Transcript → Risk Engine → Alert Engine
 */

const prisma = require('../config/prisma');

// ── OpenAI lazy client ────────────────────────────────────────────────────────
// Client is only instantiated when the first voice call is processed so a missing
// OPENAI_API_KEY doesn't crash the entire server on startup.

let _openaiClient = null;

function getOpenAI() {
  if (!_openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in environment');

    const { default: OpenAI } = require('openai');
    _openaiClient = new OpenAI({ apiKey });
  }
  return _openaiClient;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── Emergency keyword detection ───────────────────────────────────────────────

const EMERGENCY_KEYWORDS_TH = [
  'หายใจไม่ออก', 'เจ็บหน้าอก', 'เจ็บมาก', 'หัวใจ', 'ล้มลง', 'ล้มหัวกระแทก',
  'เลือดออก', 'ชัก', 'หมดสติ', 'ไม่รู้สึกตัว', 'ช่วยด้วย', 'ฉุกเฉิน',
];
const EMERGENCY_KEYWORDS_EN = ['can\'t breathe', 'chest pain', 'heart attack', 'help me', 'emergency'];

function detectEmergency(text) {
  const t = text.toLowerCase();
  return (
    EMERGENCY_KEYWORDS_TH.some((kw) => t.includes(kw)) ||
    EMERGENCY_KEYWORDS_EN.some((kw) => t.includes(kw))
  );
}

// ── System prompt for health-check conversations ──────────────────────────────

const HEALTH_CHECK_SYSTEM_PROMPT = `คุณคือ "น้องชื่นใจ" ผู้ช่วยดูแลสุขภาพ AI ของระบบ Chuenjai AI Care Platform
ภารกิจของคุณคือโทรหาผู้สูงอายุเพื่อสอบถามสุขภาพประจำวัน

กฎสำคัญ:
1. ใช้ภาษาไทยที่เข้าใจง่าย ไม่ซับซ้อน พูดสั้น ๆ ชัดเจน
2. ถามทีละคำถามเท่านั้น อย่ารวมหลายคำถามในประโยคเดียว
3. ลำดับการสนทนา: ทักทาย → สุขภาพทั่วไป → การทานยา → อาการผิดปกติ → อารมณ์/ความเป็นอยู่ → นัดหมอ → ลาจาก
4. หากผู้สูงอายุรายงานอาการฉุกเฉิน ให้ตอบทันทีว่ากำลังประสานเจ้าหน้าที่
5. ห้ามให้คำแนะนำทางการแพทย์ที่เกินขอบเขต ให้แนะนำพบแพทย์แทน`;

// ── processTurn ───────────────────────────────────────────────────────────────

/**
 * Process one STT transcript turn during a live call.
 *
 * @param {object} opts
 * @param {string}   opts.callId      - BigInt string ID of the active Call record
 * @param {string}   opts.elderlyId   - BigInt string ID of the Elderly
 * @param {string}   opts.transcript  - Elderly's speech (raw STT output)
 * @param {Array}    opts.history     - Prior turns: [{role:'user'|'assistant', content:string}]
 * @param {Function} [opts.onEmergency] - Called with (callId, elderlyId) if emergency detected
 *
 * @returns {{ aiText: string, isEmergency: boolean }}
 */
async function processTurn({ callId, elderlyId, transcript, history = [], onEmergency }) {
  const isEmergency = detectEmergency(transcript);

  // ── 1. Persist the elderly's spoken turn ──────────────────────────────────
  await prisma.callTranscript.create({
    data: {
      callId:   BigInt(callId),
      speaker:  'ELDERLY',
      transcript,
      sentimentScore: null,
    },
  });

  // ── 2. Emergency branch: short-circuit normal conversation ────────────────
  if (isEmergency) {
    const emergencyReply =
      'ได้รับทราบแล้วนะคะ กำลังแจ้งเจ้าหน้าที่ให้ดูแลท่านทันทีเลยค่ะ กรุณารอสักครู่นะคะ';

    await prisma.callTranscript.create({
      data: { callId: BigInt(callId), speaker: 'AI', transcript: emergencyReply },
    });

    if (onEmergency) {
      onEmergency(callId, elderlyId).catch((err) =>
        console.error('[VoiceAI.processTurn] onEmergency callback failed:', err.message)
      );
    } else {
      setImmediate(async () => {
        try {
          const alertService = require('./alert.service');
          const elderly = await prisma.elderly.findUnique({
            where:  { id: BigInt(elderlyId) },
            select: { organizationId: true },
          });
          if (elderly) {
            await alertService.createAlert({
              elderlyId,
              organizationId: elderly.organizationId.toString(),
              alertType:  'EMERGENCY',
              severity:   'CRITICAL',
              title:      'ตรวจพบอาการฉุกเฉินระหว่างการโทร',
              description: `คำพูดของผู้สูงอายุ: "${transcript}"`,
            });
          }
        } catch (err) {
          console.error('[VoiceAI] Emergency alert dispatch failed:', err.message);
        }
      });
    }

    return { aiText: emergencyReply, isEmergency: true };
  }

  // ── 3. Normal conversation turn via OpenAI ────────────────────────────────
  const messages = [
    { role: 'system', content: HEALTH_CHECK_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: transcript },
  ];

  let aiText = 'ขอโทษนะคะ ไม่ค่อยได้ยิน รบกวนพูดใหม่อีกครั้งได้ไหมคะ';

  try {
    const completion = await getOpenAI().chat.completions.create({
      model:       OPENAI_MODEL,
      messages,
      max_tokens:  150,
      temperature: 0.7,
    });
    aiText = completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('[VoiceAI.processTurn] OpenAI error:', err.message);
  }

  // ── 4. Persist AI's response ──────────────────────────────────────────────
  await prisma.callTranscript.create({
    data: { callId: BigInt(callId), speaker: 'AI', transcript: aiText },
  });

  return { aiText, isEmergency: false };
}

// ── concludeCall ──────────────────────────────────────────────────────────────

/**
 * Finalise a call after it ends.
 *
 * @param {string} callId
 * @param {string} elderlyId
 * @returns {{ aiConversation: object, analysis: object } | null}
 */
async function concludeCall(callId, elderlyId) {
  const transcripts = await prisma.callTranscript.findMany({
    where:   { callId: BigInt(callId) },
    orderBy: { createdAt: 'asc' },
  });

  if (!transcripts.length) {
    return null;
  }

  const conversationText = transcripts
    .map((t) => `${t.speaker === 'AI' ? 'AI' : 'ผู้สูงอายุ'}: ${t.transcript}`)
    .join('\n');

  const analysisPrompt =
    `วิเคราะห์บทสนทนาต่อไปนี้ระหว่าง AI ผู้ดูแลและผู้สูงอายุ:\n\n${conversationText}\n\n` +
    `ตอบกลับเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น):\n` +
    `{\n` +
    `  "summary": "สรุปบทสนทนา 2-3 ประโยค",\n` +
    `  "sentimentScore": <ตัวเลข -1.0 ถึง 1.0>,\n` +
    `  "lonelinessScore": <ตัวเลข 0.0 ถึง 1.0>,\n` +
    `  "depressionScore": <ตัวเลข 0.0 ถึง 1.0>,\n` +
    `  "riskScore": <ตัวเลข 0.0 ถึง 1.0>,\n` +
    `  "aiRecommendation": "คำแนะนำสำหรับเจ้าหน้าที่ดูแล",\n` +
    `  "medicationCompliance": "GOOD|POOR|UNKNOWN",\n` +
    `  "keySymptoms": ["อาการที่พบ"],\n` +
    `  "isEmergency": <true|false>\n` +
    `}`;

  const DEFAULT_ANALYSIS = {
    summary:             'ไม่สามารถวิเคราะห์บทสนทนาได้',
    sentimentScore:      0.0,
    lonelinessScore:     0.0,
    depressionScore:     0.0,
    riskScore:           0.0,
    aiRecommendation:    null,
    medicationCompliance:'UNKNOWN',
    keySymptoms:         [],
    isEmergency:         false,
  };

  let analysis = { ...DEFAULT_ANALYSIS };

  try {
    const completion = await getOpenAI().chat.completions.create({
      model:           OPENAI_MODEL,
      messages: [
        {
          role:    'system',
          content: 'คุณคือผู้เชี่ยวชาญด้านสุขภาพจิตและสุขภาพผู้สูงอายุ ตอบกลับเป็น JSON เท่านั้น',
        },
        { role: 'user', content: analysisPrompt },
      ],
      max_tokens:      700,
      temperature:     0.2,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    analysis = { ...DEFAULT_ANALYSIS, ...parsed };
  } catch (err) {
    console.error('[VoiceAI.concludeCall] OpenAI analysis failed:', err.message);
  }

  const aiConversation = await prisma.aiConversation.create({
    data: {
      elderlyId:        BigInt(elderlyId),
      callId:           BigInt(callId),
      conversationType: 'HEALTH_CHECK',
      summary:          analysis.summary,
      sentimentScore:   analysis.sentimentScore,
      lonelinessScore:  analysis.lonelinessScore,
      depressionScore:  analysis.depressionScore,
      riskScore:        analysis.riskScore,
      aiRecommendation: analysis.aiRecommendation,
    },
  });

  await prisma.callTranscript.updateMany({
    where: { callId: BigInt(callId), speaker: 'ELDERLY' },
    data:  { sentimentScore: analysis.sentimentScore },
  }).catch(() => {});

  const elderly = await prisma.elderly.findUnique({
    where:  { id: BigInt(elderlyId) },
    select: { organizationId: true },
  });

  if (elderly) {
    const riskEngine = require('./riskEngine.service');
    riskEngine
      .calculateForElderly(elderlyId, elderly.organizationId.toString())
      .catch((err) => console.error('[VoiceAI.concludeCall] Risk calculation failed:', err.message));
  }

  return { aiConversation, analysis };
}

// ── buildInitialGreeting ──────────────────────────────────────────────────────

/**
 * Generate the AI's opening line for a new call.
 */
async function buildInitialGreeting(elderlyFirstName) {
  const name = elderlyFirstName || 'คุณ';
  const prompt = `สร้างคำทักทายเปิดการสนทนาสำหรับผู้สูงอายุชื่อ "${name}" ในฐานะ น้องชื่นใจ AI สั้น ๆ กระชับ ไม่เกิน 2 ประโยค`;

  let greeting = `สวัสดีค่ะ คุณ${name} หนูชื่นใจโทรมาสอบถามสุขภาพประจำวันนะคะ วันนี้เป็นอย่างไรบ้างคะ?`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model:       OPENAI_MODEL,
      messages: [
        { role: 'system', content: HEALTH_CHECK_SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  80,
      temperature: 0.8,
    });
    greeting = completion.choices[0].message.content.trim();
  } catch {
    // Silently fall back to static greeting
  }

  return greeting;
}

module.exports = { processTurn, concludeCall, detectEmergency, buildInitialGreeting };
