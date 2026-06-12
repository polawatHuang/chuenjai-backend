/**
 * Full system test — run with: node --env-file=.env test-all.js
 */
'use strict';
const PORT = process.env.PORT || 4000;
const BASE = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data: json };
}

async function run() {
  const results = [];
  function pass(name) { results.push({ name, ok: true }); console.log('✅', name); }
  function fail(name, msg) { results.push({ name, ok: false, msg }); console.log('❌', name, '—', String(msg).slice(0, 80)); }

  // ── 1. Infrastructure ────────────────────────────────────────────
  console.log('\n── Infrastructure ──────────────────────────');
  try {
    const r = await req('GET', '/api/health');
    r.ok ? pass('Health check') : fail('Health check', r.status);
  } catch (e) { fail('Health check', e.message); }

  // ── 2. Auth ──────────────────────────────────────────────────────
  console.log('\n── Auth ────────────────────────────────────');
  let token = '';
  try {
    const r = await req('POST', '/api/v1/auth/login', { username: 'superadmin', password: 'Admin@1234!' });
    const t = r.data.data?.token ?? r.data.data?.accessToken;
    if (r.ok && t) { token = t; pass('Login (superadmin)'); }
    else fail('Login (superadmin)', JSON.stringify(r.data).slice(0, 80));
  } catch (e) { fail('Login (superadmin)', e.message); }

  if (!token) { console.log('\n⛔ Cannot continue without token'); return; }

  try {
    const r = await req('GET', '/api/v1/auth/me', null, token);
    r.ok && r.data.data?.role === 'SUPER_ADMIN' ? pass('/me → role=SUPER_ADMIN') : fail('/me', r.status);
  } catch (e) { fail('/me', e.message); }

  // Unauthenticated = 401
  try {
    const r = await req('GET', '/api/v1/elderlies');
    r.status === 401 ? pass('Unauthenticated → 401') : fail('Unauthenticated → 401', 'got ' + r.status);
  } catch (e) { fail('Unauthenticated → 401', e.message); }

  // Invalid token = 401
  try {
    const r = await req('GET', '/api/v1/elderlies', null, 'bad.token');
    r.status === 401 ? pass('Invalid token → 401') : fail('Invalid token → 401', 'got ' + r.status);
  } catch (e) { fail('Invalid token → 401', e.message); }

  // ── 3. Core Elderly & Healthcare ─────────────────────────────────
  console.log('\n── Core Elderly & Healthcare ───────────────');
  const core = [
    ['Elderly list',          'GET', '/api/v1/elderlies?limit=3'],
    ['Elderly patient360',    'GET', '/api/v1/patients/21/360'],
    ['Disease list',          'GET', '/api/v1/diseases?elderlyId=21'],
    ['Medication list',       'GET', '/api/v1/medications?elderlyId=21'],
    ['Caregiver list',        'GET', '/api/v1/caregivers?elderlyId=21'],
    ['EmergencyContact list', 'GET', '/api/v1/emergency-contacts?elderlyId=21'],
    ['MedLog list',           'GET', '/api/v1/medication-logs?elderlyId=21'],
    ['Appointment summary',   'GET', '/api/v1/appointments/summary'],
    ['Appointment list',      'GET', '/api/v1/appointments?limit=3'],
    ['Alert list',            'GET', '/api/v1/alerts?limit=3'],
    ['Notification list',     'GET', '/api/v1/notifications?limit=3'],
    ['MedCenter summary',     'GET', '/api/v1/medication-center/summary'],
    ['CallCenter summary',    'GET', '/api/v1/call-center/summary'],
  ];
  for (const [name, m, p] of core) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 4. Analytics & Reports ───────────────────────────────────────
  console.log('\n── Analytics & Reports ─────────────────────');
  const analytics = [
    ['Analytics summary',   'GET', '/api/v1/analytics/summary'],
    ['Analytics cohort',    'GET', '/api/v1/analytics/cohort-retention'],
    ['Analytics CLV',       'GET', '/api/v1/analytics/clv'],
    ['Analytics revenue',   'GET', '/api/v1/analytics/revenue'],
    ['Analytics inventory', 'GET', '/api/v1/analytics/inventory'],
    ['Reports summary',     'GET', '/api/v1/reports/summary'],
    ['Audit logs',          'GET', '/api/v1/audit-logs?limit=3'],
  ];
  for (const [name, m, p] of analytics) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 5. Settings ──────────────────────────────────────────────────
  console.log('\n── Settings ────────────────────────────────');
  const settings = [
    ['Settings profile',      'GET', '/api/v1/settings/profile'],
    ['Settings integrations', 'GET', '/api/v1/settings/integrations'],
    ['Settings role-perms',   'GET', '/api/v1/settings/permissions'],
  ];
  for (const [name, m, p] of settings) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 6. Nutrition CRM ─────────────────────────────────────────────
  console.log('\n── Nutrition CRM ───────────────────────────');
  const crm = [
    ['Formulation list',      'GET', '/api/v1/formulations?limit=3'],
    ['Ingredient list',       'GET', '/api/v1/formulations/ingredients?limit=3'],
    ['OEM orders',            'GET', '/api/v1/formulations/oem-orders?limit=3'],
    ['Journey board',         'GET', '/api/v1/journey/board'],
    ['Subscriptions list',    'GET', '/api/v1/journey/subscriptions?limit=3'],
    ['TeleHealth list',       'GET', '/api/v1/tele-health/consultations?limit=3'],
    ['TeleHealth slots',      'GET', '/api/v1/tele-health/doctor-slots'],
    ['LabResult list',        'GET', '/api/v1/lab-results?limit=3'],
  ];
  for (const [name, m, p] of crm) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 7. Messaging & LINE ──────────────────────────────────────────
  console.log('\n── Messaging & LINE ────────────────────────');
  const messaging = [
    ['Chat routes',         'GET', '/api/v1/messaging/chat-routes'],
    ['Rich menus',          'GET', '/api/v1/messaging/rich-menus'],
    ['Broadcasts',          'GET', '/api/v1/messaging/broadcasts?limit=3'],
    ['LineChat stats',      'GET', '/api/v1/line-chat/stats'],
    ['LineChat convs',      'GET', '/api/v1/line-chat/conversations?limit=3'],
  ];
  for (const [name, m, p] of messaging) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 8. Documents & Consent ───────────────────────────────────────
  console.log('\n── Documents & Consent ─────────────────────');
  const docs = [
    ['Document list', 'GET', '/api/v1/documents?limit=3'],
    ['Consent list',  'GET', '/api/v1/consent?limit=3'],
  ];
  for (const [name, m, p] of docs) {
    try {
      const r = await req(m, p, null, token);
      r.ok ? pass(name) : fail(name, 'HTTP ' + r.status + ' ' + (r.data?.message ?? ''));
    } catch (e) { fail(name, e.message); }
  }

  // ── 9. LINE Integration config ───────────────────────────────────
  console.log('\n── LINE Integration ────────────────────────');
  try {
    const r = await req('GET', '/api/v1/settings/integrations', null, token);
    if (r.ok) {
      const lineInt = r.data.data?.find(i => i.integrationType === 'LINE');
      lineInt ? pass('LINE integration present') : fail('LINE integration present', 'Not found in integrations list');
    } else {
      fail('LINE integration check', r.status);
    }
  } catch (e) { fail('LINE integration check', e.message); }

  // ── 10. Webhook endpoint responds ───────────────────────────────
  console.log('\n── Webhook ─────────────────────────────────');
  try {
    const r = await fetch(BASE + '/webhook/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': 'invalid' },
      body: JSON.stringify({ events: [] }),
    });
    const json = await r.json().catch(() => ({}));
    // Should return 200 with status:ignored (no matching integration for bad sig)
    r.status === 200 ? pass('Webhook /webhook/line responds 200') : fail('Webhook responds', 'got ' + r.status);
  } catch (e) { fail('Webhook endpoint', e.message); }

  // ── Summary ──────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);

  console.log('\n══════════════════════════════════════════════');
  console.log('TOTAL:', passed + '/' + total, 'passed');
  if (failed.length === 0) {
    console.log('🎉 ALL TESTS PASSED — ready for production');
  } else {
    console.log('\n❌ Failed (' + failed.length + '):');
    failed.forEach(r => console.log('   ', r.name.padEnd(28), r.msg));
    console.log('\n⚠️  Fix failed tests before pushing to production');
  }
}

run().catch(console.error);
