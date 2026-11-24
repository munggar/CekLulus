const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 3187;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(root, 'server'),
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: '',
    USE_PG_MEM: 'true',
    AUTH_TOKEN_SECRET: 'ci-only-secret-with-more-than-thirty-two-characters',
    ADMIN_USERNAME: 'admin_ci',
    ADMIN_PASSWORD: 'admin-ci-password-2026'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend process exited early. Output:\n${output}`);
    }
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become ready. Output:\n${output}`);
}

async function main() {
  try {
    await waitForServer();

    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.persistentDatabaseConfigured, false);
    assert.equal(health.data.aiConfigured, false);
    assert.equal(health.data.authConfigured, true);

    const guestMode = await request('/api/auth/guest', { method: 'POST', body: {} });
    assert.equal(guestMode.status, 410, 'The old demo guest-account flow must stay disabled.');

    const deniedCurriculum = await request('/api/curriculum');
    assert.equal(deniedCurriculum.status, 401, 'Curriculum must require an authenticated session.');

    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { id: 'admin_ci', password: 'admin-ci-password-2026' }
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.data));
    const adminToken = adminLogin.data.token;
    assert.equal(adminLogin.data.user.role, 'admin');

    const initialCurriculum = await request('/api/curriculum', { token: adminToken });
    assert.equal(initialCurriculum.status, 200);
    assert.equal(initialCurriculum.data.courses.length, 84, 'The seed curriculum should be available after database initialization.');

    const registration = await request('/api/auth/register', {
      method: 'POST',
      body: {
        id: '2403045999',
        name: 'Mahasiswa Uji CI',
        prodi: 'Sistem dan Teknologi Informasi',
        angkatan: 2024,
        password: 'student-ci-password-2026'
      }
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.data));
    assert.equal(registration.data.user.angkatan, 2024);
    assert.equal(registration.data.data.sems.length, 0, 'New student accounts must not receive sample KHS records.');
    assert.equal(registration.data.user.guest, false);
    const studentToken = registration.data.token;

    const studentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { id: '2403045999', password: 'student-ci-password-2026' }
    });
    assert.equal(studentLogin.status, 200);
    assert.equal(studentLogin.data.user.angkatan, 2024, 'Cohort year must persist after a fresh login.');

    const studentCurriculum = await request('/api/curriculum', { token: studentLogin.data.token });
    assert.equal(studentCurriculum.status, 200);
    assert.equal(studentCurriculum.data.courses.length, 84);

    const studentImportAttempt = await request('/api/admin/curriculum', {
      method: 'POST',
      token: studentToken,
      body: { courses: [{ semester: 1, code: 'X1', name: 'Unauthorized', sks: 2 }] }
    });
    assert.equal(studentImportAttempt.status, 403, 'A student must not overwrite the curriculum.');

    const noSessionImportAttempt = await request('/api/admin/curriculum', {
      method: 'POST',
      body: { courses: [{ semester: 1, code: 'X1', name: 'Unauthorized', sks: 2 }] }
    });
    assert.equal(noSessionImportAttempt.status, 401);

    const importPayload = {
      sourceFile: 'ci-curriculum.xlsx',
      program: 'Sistem dan Teknologi Informasi (S1)',
      institution: 'Universitas Muhammadiyah Prof. DR. HAMKA',
      sheet: 'Prasyarat Mata Kuliah',
      courses: [
        { semester: 3, code: 'MULTI001', name: 'Ketrampilan Komunikasi', category: 'Pengayaan', sks: 2, prerequisite: 'Tidak Ada', notes: 'Dapat diambil mulai Sem 3 / 5' },
        { semester: 5, code: 'MULTI001', name: 'Ketrampilan Komunikasi', category: 'Pengayaan', sks: 2, prerequisite: 'Tidak Ada', notes: 'Dapat diambil di semester 3/5/7' },
        { semester: 1, code: 'BAD001', name: 'Matematika A', category: 'Wajib', sks: 2, prerequisite: 'Tidak Ada', notes: 'Wajib Semester 1' },
        { semester: 2, code: 'BAD001', name: 'Bahasa B', category: 'Wajib', sks: 2, prerequisite: 'Tidak Ada', notes: 'Wajib Semester 2' }
      ]
    };
    const imported = await request('/api/admin/curriculum', {
      method: 'POST',
      token: adminToken,
      body: importPayload
    });
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.meta.courseCount, 4);
    assert.deepEqual(imported.data.meta.duplicateCodes, ['BAD001']);
    assert.deepEqual(imported.data.meta.multiSemesterCodes, ['MULTI001']);

    const persistedCurriculum = await request('/api/curriculum', { token: studentToken });
    assert.equal(persistedCurriculum.status, 200);
    assert.equal(persistedCurriculum.data.courses.length, 4);
    assert.equal(persistedCurriculum.data.meta.sourceFile, 'ci-curriculum.xlsx');
    assert.deepEqual(persistedCurriculum.data.meta.multiSemesterCodes, ['MULTI001']);

    const invalidImport = await request('/api/admin/curriculum', {
      method: 'POST',
      token: adminToken,
      body: { courses: [{ semester: 99, code: 'BAD', name: 'Invalid Semester', sks: 2 }] }
    });
    assert.equal(invalidImport.status, 400, 'Invalid curriculum rows must be rejected.');

    const adminStudentList = await request('/api/admin/students', { token: adminToken });
    assert.equal(adminStudentList.status, 200);
    const student = adminStudentList.data.students.find(item => item.id === '2403045999');
    assert.ok(student, 'New student should appear in the admin monitoring list.');
    assert.equal(Number(student.angkatan), 2024);

    const changedCohort = await request('/api/admin/students/2403045999/angkatan', {
      method: 'PUT',
      token: adminToken,
      body: { angkatan: 2023 }
    });
    assert.equal(changedCohort.status, 200);
    assert.equal(Number(changedCohort.data.student.angkatan), 2023);

    const freshStudentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { id: '2403045999', password: 'student-ci-password-2026' }
    });
    assert.equal(freshStudentLogin.status, 200);
    assert.equal(freshStudentLogin.data.user.angkatan, 2023);

    const unauthenticatedChat = await request('/api/ai/chat', {
      method: 'POST',
      body: { message: 'Kapan saya lulus?' }
    });
    assert.equal(unauthenticatedChat.status, 401, 'Lulu must require an authenticated student account.');

    const studentChat = await request('/api/ai/chat', {
      method: 'POST',
      token: freshStudentLogin.data.token,
      body: { message: 'Kapan saya lulus?' }
    });
    assert.equal(studentChat.status, 503, 'Without a Groq key, Lulu should return a clear configuration status after authentication.');

    console.log('Backend API smoke test passed: auth, cohort persistence, curriculum access/import, role checks, validation and Lulu authentication.');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      const timeout = setTimeout(resolve, 2500);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}

main().catch(error => {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
});
