const assert = require('node:assert/strict');

const baseUrl = process.env.CEKLULUS_PRODUCTION_URL || 'https://ceklulus.onrender.com';

async function fetchJson(path, method = 'GET') {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { 'Cache-Control': 'no-cache' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  let health = null;
  let lastError = null;
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    try {
      const result = await fetchJson('/api/health');
      if (result.status === 200 && result.body.ok === true) {
        health = result.body;
        break;
      }
      lastError = new Error(`Unexpected health response: HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 4000));
  }

  assert.ok(health, `Production health endpoint did not become ready: ${lastError?.message || 'timeout'}`);
  assert.equal(health.persistentDatabaseConfigured, true, 'Production must use persistent PostgreSQL, not in-memory storage.');
  assert.equal(health.authConfigured, true, 'Authentication signing secret must be configured.');

  const app = await fetch(new URL('/app.js', baseUrl), { signal: AbortSignal.timeout(15000) });
  assert.equal(app.status, 200, 'Frontend JavaScript asset must be served.');
  const appSource = await app.text();
  assert.ok(!appSource.includes('Coba tanpa akun'), 'Production login page must not contain the sample guest entry.');
  assert.ok(!appSource.includes("Pemrograman Dasar',3,'B+"), 'Production frontend must not contain seeded sample KHS.');

  const curriculum = await fetchJson('/api/curriculum');
  assert.equal(curriculum.status, 401, 'Curriculum endpoint must require a signed-in user.');

  const guest = await fetchJson('/api/auth/guest', 'POST');
  assert.notEqual(guest.status, 201, 'Production must not create demo guest users.');

  console.log('Production readiness check passed: public health, persistent database flag, authentication, frontend assets, protected curriculum route, and guest demo disabled.');
  console.log(`Lulu Groq AI configuration: ${health.aiConfigured ? 'configured' : 'NOT CONFIGURED'}`);
  if (!health.aiConfigured) {
    console.warn('Set GROQ_API_KEY in Render Environment before enabling live AI consultation.');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
