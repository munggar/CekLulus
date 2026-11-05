const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { newDb } = require('pg-mem');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
let pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const scrypt = promisify(crypto.scrypt);

function createMemoryPool() {
  const db = newDb();
  const { Pool: MemoryPool } = db.adapters.createPg();
  return new MemoryPool();
}

async function ensureDatabasePool() {
  if (!pool) {
    if (process.env.USE_PG_MEM === 'false') {
      throw new Error('DATABASE_URL wajib diisi saat fallback database in-memory dinonaktifkan.');
    }
    pool = createMemoryPool();
    console.warn('DATABASE_URL belum dikonfigurasi; menjalankan fallback database in-memory untuk pengembangan lokal.');
    return;
  }

  try {
    await pool.query('SELECT 1');
    return;
  } catch (error) {
    const message = String(error?.message || error || '');
    const shouldFallback = /ECONNREFUSED|ENOTFOUND|no pg_hba|password authentication|database .* does not exist|connection/i.test(message);
    if (!shouldFallback || process.env.USE_PG_MEM === 'false') {
      throw error;
    }

    console.warn('PostgreSQL tidak tersedia, menjalankan database in-memory untuk pengembangan lokal.');
    pool = createMemoryPool();
  }
}
const DEFAULT_SETTINGS = { total: 144, maxSem: 14, minIpk: 2 };
const uploadDir = path.join(__dirname, 'tmp', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  : null;

function normalizeGradeToken(v) {
  const t = String(v || '').toUpperCase().replace(/\s+/g, '').replace(/PLUS/,'+').replace(/MINUS/,'-');
  if (t.includes('A+')) return 'A+';
  if (t.includes('A-')) return 'A-';
  if (t.includes('B+')) return 'B+';
  if (t.includes('B-')) return 'B-';
  if (t.includes('C+')) return 'C+';
  if (t.includes('C-')) return 'C-';
  if (t.includes('A')) return 'A';
  if (t.includes('B')) return 'B';
  if (t.includes('C')) return 'C';
  if (t.includes('D')) return 'D';
  if (t.includes('E')) return 'E';
  return null;
}

function normalizeKhsName(name) {
  return String(name || '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^\s*\d{1,3}[.)]?\s*(?=[A-Za-z]\d{4,})/, '')
    .replace(/^\s*\d{1,3}[.)]?\s+/, '')
    .replace(/^[A-Za-z]{1,6}[-.]?\d{2,}/, ' ')
    .replace(/\b[A-Za-z]{1,6}[-.]?\d{2,}[A-Za-z]?\b/g, ' ')
    .replace(/\b\d{3,5}\b(?=\s+[A-Za-z])/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:semester|sks|ips|ipk|nilai|transkrip|khs|mata kuliah|matkul)\b/gi, ' ')
    .replace(/[:;|]+/g, ' ')
    .replace(/[^a-zA-Z0-9&/()\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[-–—]+$/, '')
    .trim();
}

function parseKhsText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '\n').replace(/\u00a0/g, ' ').replace(/\|/g, ' ');
  if (!text.trim()) return [];

  const lines = text
    .split(/\n+|\t+/)
    .map(line => line.replace(/[;|]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const matches = [];
  for (const line of lines) {
    if (!/[A-E](?:\+|-)?/i.test(line)) continue;

    let parsed = null;
    const p1 = line.match(/([A-Za-z0-9&/()\-., ]+?)\s+(\d{1,2})\s*(?:SKS)?\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=$|\s)/i);
    if (p1) {
      parsed = { name: normalizeKhsName(p1[1]), sks: Number(p1[2]), g: normalizeGradeToken(p1[3]) };
    }

    if (!parsed) {
      const p2 = line.match(/([A-Za-z0-9&/()\-., ]+?)\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=\s|$)\s*(\d{1,2})\s*(?:SKS)?/i);
      if (p2) {
        parsed = { name: normalizeKhsName(p2[1]), sks: Number(p2[3]), g: normalizeGradeToken(p2[2]) };
      }
    }

    if (!parsed) {
      const p3 = line.match(/(\d{1,2})\s*(?:SKS)?\s*([A-Za-z0-9&/()\-., ]+?)\s*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D|E)(?=$|\s)/i);
      if (p3) {
        parsed = { name: normalizeKhsName(p3[2]), sks: Number(p3[1]), g: normalizeGradeToken(p3[3]) };
      }
    }

    if (!parsed) {
      const fallback = line.match(/([A-Za-z0-9&/()\-., ]+?)\s+(\d{1,2})\s*(?:SKS)?\s*[:\-]?\s*([A-E](?:\+|-)?)/i);
      if (fallback) {
        parsed = { name: normalizeKhsName(fallback[1]), sks: Number(fallback[2]), g: normalizeGradeToken(fallback[3]) };
      }
    }

    if (!parsed) continue;
    const { name, sks, g } = parsed;
    if (!name || !/[A-Za-z]/.test(name) || !g || !Number.isFinite(sks) || sks <= 0 || /^(?:semester|ips|ipk|nilai|sks|khs|transkrip)$/i.test(name)) continue;
    matches.push({ name, sks, g, t: 'W' });
  }

  const unique = [];
  const seen = new Set();
  for (const item of matches) {
    const key = `${item.name.toLowerCase()}-${item.sks}-${item.g}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function summarizeStudent(student) {
  const semesters = Array.isArray(student?.khs?.semesters) ? student.khs.semesters : Array.isArray(student?.semesters) ? student.semesters : [];
  const totalSks = semesters.reduce((sum, sem) => sum + (Array.isArray(sem.courses) ? sem.courses.reduce((a, c) => a + Number(c.sks || 0), 0) : 0), 0);
  const finalGradeMap = { 'A+': 4, 'A': 4, 'A-': 3.75, 'B+': 3.25, 'B': 3, 'B-': 2.75, 'C+': 2.25, 'C': 2, 'C-': 1.75, 'D': 1, 'E': 0 };
  let points = 0;
  let sks = 0;
  semesters.forEach((sem) => {
    const courses = Array.isArray(sem.courses) ? sem.courses : [];
    courses.forEach((c) => {
      const grade = finalGradeMap[c.grade] ?? 0;
      points += Number(c.sks || 0) * grade;
      sks += Number(c.sks || 0);
    });
  });
  const ipk = sks ? points / sks : 0;
  return {
    totalSks,
    ipk,
    latestSemester: semesters.at(-1)?.semester || null,
    risky: semesters.flatMap((sem) => (sem.courses || []).filter(c => (finalGradeMap[c.grade] ?? 0) < 2).map(c => ({ ...c, semester: sem.semester })))
  };
}

function fallbackLocalAssistant(message, student) {
  const msg = String(message || '').toLowerCase();
  const summary = summarizeStudent(student);
  const totalSks = summary.totalSks || 0;
  const ipk = summary.ipk || 0;
  const rem = Math.max(0, 144 - totalSks);

  if (/sisa sks|sks sisa|berapa sks/.test(msg)) {
    return `Saat ini total SKS yang sudah diselesaikan adalah ${totalSks} SKS dari target 144 SKS. Sisa SKS kamu adalah ${rem} SKS.`;
  }

  if (/perbaiki|nilai d|remedial|berisiko/.test(msg)) {
    if (!summary.risky.length) {
      return `Tidak ada nilai di bawah C pada data KHS saat ini. Kamu sudah dalam kondisi aman untuk kelulusan.`;
    }
    const list = summary.risky.slice(0, 3).map(item => `${item.name} (${item.grade}, ${item.sks} SKS)`).join(', ');
    return `Mata kuliah yang paling berisiko adalah: ${list}. Prioritaskan perbaikan untuk mata kuliah tersebut agar IPK dan syarat kelulusan tidak terganggu.`;
  }

  if (/syarat skripsi|skripsi|kelulusan/.test(msg)) {
    const syarat = {
      sks: totalSks >= 144,
      ipk: ipk >= 2,
      badGrade: !summary.risky.some(item => ['D', 'E'].includes(item.grade))
    };
    return `Berdasarkan data KHS, status umum: SKS ${syarat.sks ? 'sudah memenuhi' : 'belum memenuhi'} target, IPK ${syarat.ipk ? 'sudah memenuhi' : 'belum memenuhi'} ambang minimum, dan nilai D/E ${syarat.badGrade ? 'tidak ada' : 'masih ada'}.`;
  }

  if (/ipk|prediksi|lulus/.test(msg)) {
    return `IPK kumulatif saat ini sekitar ${Number(ipk || 0).toFixed(2)}. Dengan data KHS yang ada, saya bisa membantu menghitung proyeksi lulus dan rekomendasi mata kuliah berikutnya.`;
  }

  if (/hallo|halo|hai/.test(msg) || !msg.trim()) {
    return `Halo! Saya siap membantu menganalisis KHS dan prediksi kelulusanmu. Kirim pertanyaan terkait SKS, IPK, syarat kelulusan, atau mata kuliah yang perlu diperbaiki.`;
  }

  return `Saya melihat data KHSmu sudah ada. Berdasarkan data saat ini, total SKS ${totalSks}, IPK ${Number(ipk || 0).toFixed(2)}, dan sisa SKS ${rem}. Jika kamu mau, saya bisa membantu menghitung simulasi kelulusan atau strategi semester depan.`;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function initialStudentData(guest = false) {
  return {
    cfg: { ...DEFAULT_SETTINGS },
    sim: { sks: 20, ips: 3.5, sp: false },
    plan: null,
    chat: [],
    sems: guest ? [{
      n: 1,
      c: [
        { name: 'Kalkulus', sks: 4, g: 'A-', t: 'W' },
        { name: 'Pemrograman Dasar', sks: 3, g: 'B+', t: 'W' },
        { name: 'Bahasa Inggris', sks: 2, g: 'A', t: 'W' }
      ]
    }] : []
  };
}

async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    iat: now,
    exp: now + 60 * 60 * 24 * 30
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !process.env.AUTH_TOKEN_SECRET) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return value.exp > Math.floor(Date.now() / 1000) ? value : null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, prodi: user.prodi || '', role: user.role, guest: user.guest };
}

async function authRequired(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const payload = readToken(token);
  if (!payload) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.' });
  try {
    const result = await pool.query(
      'SELECT id, name, prodi, role, guest FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Akun tidak ditemukan. Silakan masuk kembali.' });
    req.user = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses hanya untuk admin.' });
  return next();
}

async function authResponse(user) {
  const [data, settings] = await Promise.all([
    pool.query('SELECT state FROM student_data WHERE user_id = $1', [user.id]),
    pool.query("SELECT value FROM app_settings WHERE key = 'study_rules'")
  ]);
  return {
    token: issueToken(user),
    user: publicUser(user),
    data: data.rows[0]?.state || initialStudentData(user.guest),
    settings: settings.rows[0]?.value || DEFAULT_SETTINGS
  };
}

async function initializeDatabase() {
  await ensureDatabasePool();
  if (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET wajib diisi dengan nilai acak minimal 32 karakter di server/.env.');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prodi TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      guest BOOLEAN NOT NULL DEFAULT FALSE,
      password_salt TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_id_case_insensitive ON users (LOWER(id));
    CREATE TABLE IF NOT EXISTS student_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    INSERT INTO app_settings (key, value)
    VALUES ('study_rules', $1::jsonb)
    ON CONFLICT (key) DO NOTHING
  `, [JSON.stringify(DEFAULT_SETTINGS)]);

  const adminId = (process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (adminId && adminPassword) {
    if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD harus terdiri dari minimal 12 karakter.');
    const { salt, hash } = await passwordHash(adminPassword);
    await pool.query(`
      INSERT INTO users (id, name, prodi, role, password_salt, password_hash)
      VALUES ($1, 'Admin CekLulus', 'Administrator', 'admin', $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        role = 'admin', password_salt = EXCLUDED.password_salt, password_hash = EXCLUDED.password_hash
    `, [adminId, salt, hash]);
  } else {
    console.warn('Login admin dinonaktifkan: ADMIN_USERNAME dan ADMIN_PASSWORD belum dikonfigurasi.');
  }
}

app.get('/api', (req, res) => {
  res.json({
    service: 'CekLulus AI backend',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      data: 'GET/PUT /api/data',
      parseKhs: 'POST /api/khs/parse',
      aiChat: 'POST /api/ai/chat'
    }
  });
});

app.post('/api/auth/register', async (req, res, next) => {
  const id = String(req.body?.id || '').trim();
  const name = String(req.body?.name || '').trim();
  const prodi = String(req.body?.prodi || '').trim();
  const password = String(req.body?.password || '');
  if (id.length < 2 || id.length > 100 || name.length < 2 || name.length > 150 || prodi.length > 150 || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Nama, NIM/email, atau kata sandi tidak memenuhi ketentuan (sandi minimal 8 karakter).' });
  }
  let client;
  try {
    const { salt, hash } = await passwordHash(password);
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO users (id, name, prodi, role, password_salt, password_hash)
      VALUES ($1, $2, $3, 'student', $4, $5)
      RETURNING id, name, prodi, role, guest
    `, [id, name, prodi, salt, hash]);
    const user = result.rows[0];
    await client.query('INSERT INTO student_data (user_id, state) VALUES ($1, $2::jsonb)', [
      user.id, JSON.stringify(initialStudentData())
    ]);
    await client.query('COMMIT');
    return res.status(201).json(await authResponse(user));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(rollbackError => console.error('Rollback akun gagal:', rollbackError));
    if (error.code === '23505') return res.status(409).json({ error: 'NIM/email sudah terdaftar. Silakan masuk.' });
    return next(error);
  } finally {
    client?.release();
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const id = String(req.body?.id || '').trim();
  const password = String(req.body?.password || '');
  if (!id || !password) return res.status(400).json({ error: 'Isi NIM/email dan kata sandi.' });
  if (password.length > 128) return res.status(401).json({ error: 'NIM/email atau kata sandi salah.' });
  try {
    const result = await pool.query(
      'SELECT id, name, prodi, role, guest, password_salt, password_hash FROM users WHERE LOWER(id) = LOWER($1)',
      [id]
    );
    const user = result.rows[0];
    if (!user?.password_salt || !user.password_hash) {
      return res.status(401).json({ error: 'NIM/email atau kata sandi salah.' });
    }
    const { hash } = await passwordHash(password, user.password_salt);
    const expected = Buffer.from(user.password_hash, 'hex');
    const actual = Buffer.from(hash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: 'NIM/email atau kata sandi salah.' });
    }
    return res.json(await authResponse(user));
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/guest', async (req, res, next) => {
  const id = `guest_${crypto.randomUUID()}`;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO users (id, name, prodi, role, guest)
      VALUES ($1, 'Alya', 'Teknik Informatika', 'student', TRUE)
      RETURNING id, name, prodi, role, guest
    `, [id]);
    const user = result.rows[0];
    await client.query('INSERT INTO student_data (user_id, state) VALUES ($1, $2::jsonb)', [
      user.id, JSON.stringify(initialStudentData(true))
    ]);
    await client.query('COMMIT');
    return res.status(201).json(await authResponse(user));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(rollbackError => console.error('Rollback akun tamu gagal:', rollbackError));
    return next(error);
  } finally {
    client?.release();
  }
});

app.get('/api/auth/me', authRequired, async (req, res, next) => {
  try {
    return res.json(await authResponse(req.user));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/data', authRequired, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT state FROM student_data WHERE user_id = $1', [req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Data mahasiswa tidak ditemukan.' });
    return res.json({ data: result.rows[0].state });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/data', authRequired, async (req, res, next) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Data akademik hanya dapat diubah oleh mahasiswa.' });
  const state = req.body?.data;
  if (!state || typeof state !== 'object' || Array.isArray(state) || !Array.isArray(state.sems)) {
    return res.status(400).json({ error: 'Format data mahasiswa tidak valid.' });
  }
  try {
    await pool.query(`
      INSERT INTO student_data (user_id, state, updated_at) VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `, [req.user.id, JSON.stringify(state)]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/settings', authRequired, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'study_rules'");
    return res.json({ settings: result.rows[0]?.value || DEFAULT_SETTINGS });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/settings', authRequired, adminRequired, async (req, res, next) => {
  const { total, maxSem, minIpk } = req.body?.settings || {};
  if (![total, maxSem, minIpk].every(Number.isFinite) || total < 1 || maxSem < 1 || minIpk < 0 || minIpk > 4) {
    return res.status(400).json({ error: 'Aturan studi tidak valid.' });
  }
  try {
    const settings = { total, maxSem, minIpk };
    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('study_rules', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [JSON.stringify(settings)]);
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/students', authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.prodi, u.guest, COALESCE(d.state, '{}'::jsonb) AS data
      FROM users u
      LEFT JOIN student_data d ON d.user_id = u.id
      WHERE u.role = 'student' AND u.guest = FALSE
      ORDER BY u.created_at DESC
    `);
    return res.json({ students: result.rows });
  } catch (error) {
    return next(error);
  }
});

const appFiles = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/style.css': 'style.css',
  '/manifest.json': 'manifest.json',
  '/icon.svg': 'icon.svg',
  '/sw.js': 'sw.js'
};
const appDir = path.resolve(__dirname, '..');
app.get(Object.keys(appFiles), (req, res, next) => {
  const file = appFiles[req.path];
  if (!file) return next();
  res.sendFile(path.join(appDir, file));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'ceklulus-ai-backend' });
});

app.post('/api/khs/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Silakan upload file PDF KHS.' });
    }

    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(dataBuffer);
    const detected = parseKhsText(pdfData.text || '');

    fs.unlinkSync(req.file.path);

    return res.json({
      detected,
      total: detected.length,
      message: detected.length ? 'Data KHS berhasil dibaca' : 'Tidak ada data mata kuliah yang terbaca dari PDF ini.'
    });
  } catch (error) {
    console.error('PDF parse error:', error);
    return res.status(500).json({ error: 'Gagal membaca PDF KHS', detail: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { message = '', student = {} } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  }

  if (!groq) {
    return res.status(503).json({ error: 'GROQ_API_KEY belum dikonfigurasi di file .env.' });
  }

  try {
    const summary = summarizeStudent(student);
    const prompt = `Data KHS mahasiswa:\n${JSON.stringify({
      name: student.name || 'Mahasiswa',
      id: student.id || 'guest',
      role: student.role || 'student',
      cfg: student.cfg || {},
      khs: student.khs || { semesters: [] },
      summary
    }, null, 2)}\n\nPertanyaan: ${message}`;

    const primaryModel = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const fallbackModel = process.env.GROQ_FALLBACK_MODEL || 'qwen/qwen3.8-27b';
    const models = [...new Set([primaryModel, fallbackModel])];
    let answer = '';

    for (const model of models) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: 'system', content: 'Kamu Lulu, asisten akademik CekLulus. Jawab dalam Bahasa Indonesia dengan ramah, langsung, dan ringkas seperti chatbot umum. Jawab inti pertanyaan saja, biasanya 1-3 kalimat; gunakan daftar hanya bila membantu. Beri rincian lebih panjang hanya jika diminta. Gunakan data mahasiswa yang diberikan, jangan mengarang fakta atau hasil hitungan. Jika data penting belum tersedia, katakan singkat apa yang kurang dan ajukan satu pertanyaan klarifikasi.' },
            { role: 'user', content: prompt }
          ]
        });
        const content = completion.choices?.[0]?.message?.content;
        answer = (typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map(part => typeof part === 'string' ? part : part?.text || '').join('')
            : '').trim();
        if (answer) break;
        console.warn(`Groq model ${model} returned an empty answer; trying the next configured model.`);
      } catch (error) {
        console.error('Groq request failed.', { model, status: error.status, code: error.code });
        if (error.status === 401 || error.status === 403) break;
      }
    }

    if (!answer) {
      return res.status(502).json({ error: 'Groq belum dapat menghasilkan jawaban. Coba lagi beberapa saat.' });
    }
    return res.json({ answer, source: 'groq' });
  } catch (error) {
    console.error('Groq API error:', error);
    return res.status(502).json({ error: 'Permintaan ke Groq gagal. Periksa API key, nama model, dan koneksi backend.' });
  }
});

app.use((error, req, res, next) => {
  console.error('Request error:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`CekLulus backend running on http://localhost:${port}`);
  });
}).catch(error => {
  console.error('Gagal menyiapkan database PostgreSQL:', error.message);
  process.exitCode = 1;
  if (pool) pool.end().catch(() => {});
});
