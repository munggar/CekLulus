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

function normalizeAcademicKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[a-z]{0,5}[-.]?\d{4,}\s*/, '')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function calculateGraduationAnalysis(student, summary) {
  const semesters = Array.isArray(student?.khs?.semesters) ? student.khs.semesters : [];
  const curriculum = Array.isArray(student?.curriculum) ? student.curriculum : [];
  if (!semesters.length || !curriculum.length) return null;

  const gradePoints = { 'A+':4, A:4, 'A-':3.75, 'B+':3.25, B:3, 'B-':2.75, 'C+':2.25, C:2, 'C-':1.75, D:1, E:0 };
  const ordered = [...semesters].sort((a,b)=>(Number(a.semester)||0)-(Number(b.semester)||0));
  const currentSemester = ordered.reduce((max,sem)=>Math.max(max,Number(sem.semester)||0),0);
  const attempts = ordered.flatMap(sem=>(sem.courses||[]).map(course=>({...course,semester:Number(sem.semester)||0})));
  const bestByKey = new Map();

  for (const course of attempts) {
    const code = String(course.code||'').trim();
    const nameKey = normalizeAcademicKey(course.name);
    const matches = code
      ? curriculum.filter(item=>String(item.code||'').trim()===code)
      : curriculum.filter(item=>normalizeAcademicKey(item.name)===nameKey);
    const key = code || (matches.length ? String(matches[0].code||nameKey) : nameKey);
    if (!key) continue;
    const grade = String(course.grade||'').toUpperCase();
    const score = gradePoints[grade] ?? -1;
    const prior = bestByKey.get(key);
    if (!prior || score > (gradePoints[prior.grade] ?? -1)) bestByKey.set(key,{...course,grade});
  }

  const passed = [...bestByKey.values()].filter(course=>(gradePoints[course.grade]??-1)>=1);
  const passedSks = passed.reduce((sum,course)=>sum+Number(course.sks||0),0);
  const required = curriculum.filter(course=>
    /^wajib\b/i.test(String(course.notes||'')) ||
    /^(praktik kerja|skripsi)$/i.test(String(course.name||''))
  );
  const missing = required.filter(course=>{
    const key=String(course.code||normalizeAcademicKey(course.name));
    const record=bestByKey.get(key);
    return !record || (gradePoints[record.grade]??-1)<1;
  }).map(course=>{
    const record=bestByKey.get(String(course.code||normalizeAcademicKey(course.name)));
    return {
      code:course.code,
      name:course.name,
      semester:Number(course.semester)||1,
      sks:Number(course.sks)||0,
      status:record?'Perlu mengulang':'Belum diambil',
      suggestedSemester:Math.max(Number(course.semester)||1,currentSemester+1)
    };
  });
  const recentLoads=ordered.slice(-2).map(sem=>(sem.courses||[]).reduce((sum,course)=>sum+Number(course.sks||0),0));
  const averageLoad=recentLoads.length
    ? Math.max(12,Math.min(24,recentLoads.reduce((sum,value)=>sum+value,0)/recentLoads.length))
    : 20;
  const totalTarget=Number(student.cfg?.total)||144;
  const remainingSks=Math.max(0,totalTarget-passedSks);
  const byCredits=currentSemester+Math.ceil(remainingSks/averageLoad);
  const nextRequired=Math.max(0,...missing.map(course=>course.suggestedSemester));
  const estimatedSemester=Math.max(currentSemester||1,byCredits,nextRequired);
  const cohort=Number(student.angkatan)||null;
  const startYear=cohort?cohort+Math.floor((estimatedSemester-1)/2):null;
  const estimatedTerm=startYear
    ? `Semester ${estimatedSemester} · ${estimatedSemester%2?'Ganjil':'Genap'} ${startYear}/${startYear+1}`
    : null;
  const dCount=passed.filter(course=>course.grade==='D').length;
  const practiceCourse=curriculum.find(course=>/^praktik kerja$/i.test(String(course.name||'')));
  const practiceRecord=practiceCourse?bestByKey.get(String(practiceCourse.code||normalizeAcademicKey(practiceCourse.name))):null;
  const thesisConditions={
    sks75:passedSks>=Math.ceil(totalTarget*.75),
    ipk:Number(summary.ipk||0)>=2.75,
    maximumD:dCount<=1,
    practice:passedSks>100 && !!practiceRecord && (gradePoints[practiceRecord.grade]??-1)>=1
  };

  return {
    passedSks,
    attemptedSks:Number(summary.totalSks)||0,
    remainingSks,
    averageLoad,
    currentSemester,
    estimatedSemester,
    estimatedTerm,
    angkatan:cohort,
    completedRequired:required.length-missing.length,
    requiredCount:required.length,
    missing,
    risky:attempts.filter(course=>(gradePoints[String(course.grade||'').toUpperCase()]??-1)<2).map(course=>({name:course.name,grade:course.grade,semester:course.semester,sks:course.sks})),
    thesisConditions,
    thesisStatus:Object.values(thesisConditions).every(Boolean)?'Syarat terukur terpenuhi; ujian proposal tetap perlu diverifikasi':'Masih ada syarat terukur yang perlu dipenuhi',
    proposalExam:'Perlu verifikasi admin/program studi; tidak dapat disimpulkan dari KHS'
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

function initialStudentData() {
  return {
    cfg: { ...DEFAULT_SETTINGS },
    sim: { sks: 20, ips: 3.5, sp: false },
    plan: null,
    chat: [],
    sems: []
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
  return { id: user.id, name: user.name, prodi: user.prodi || '', angkatan: user.angkatan ? Number(user.angkatan) : null, role: user.role, guest: user.guest };
}

async function authRequired(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const payload = readToken(token);
  if (!payload) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.' });
  try {
    const result = await pool.query(
      'SELECT id, name, prodi, angkatan, role, guest FROM users WHERE id = $1',
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
    data: data.rows[0]?.state || initialStudentData(),
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
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS angkatan INTEGER');
  await pool.query(`
    INSERT INTO app_settings (key, value)
    VALUES ('study_rules', $1::jsonb)
    ON CONFLICT (key) DO NOTHING
  `, [JSON.stringify(DEFAULT_SETTINGS)]);

  const existingCurriculum = await pool.query("SELECT value FROM app_settings WHERE key = 'curriculum' LIMIT 1");
  if (!existingCurriculum.rowCount) {
    const curriculumFile = path.join(__dirname, 'data', 'curriculum-sti.json');
    if (fs.existsSync(curriculumFile)) {
      const source = JSON.parse(fs.readFileSync(curriculumFile, 'utf8'));
      const seed = {
        meta: {
          sourceFile: source.sourceFile || 'Curriculum import',
          program: source.program || 'Program Studi',
          institution: source.institution || '',
          sheet: source.sheet || '',
          importedAt: new Date().toISOString(),
          importedBy: 'system-seed',
          courseCount: Array.isArray(source.courses) ? source.courses.length : 0
        },
        courses: Array.isArray(source.courses) ? source.courses : []
      };
      await pool.query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('curriculum', $1::jsonb, NOW()) ON CONFLICT (key) DO NOTHING",
        [JSON.stringify(seed)]
      );
    }
  }

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
  const angkatanInput = req.body?.angkatan;
  const angkatan = angkatanInput === undefined || angkatanInput === null || angkatanInput === '' ? null : Number(angkatanInput);
  if (id.length < 2 || id.length > 100 || name.length < 2 || name.length > 150 || prodi.length > 150 || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Nama, NIM/email, atau kata sandi tidak memenuhi ketentuan (sandi minimal 8 karakter).' });
  }
  if (angkatan !== null && (!Number.isInteger(angkatan) || angkatan < 2000 || angkatan > new Date().getFullYear())) {
    return res.status(400).json({ error: 'Tahun angkatan harus berupa tahun yang valid.' });
  }
  let client;
  try {
    const { salt, hash } = await passwordHash(password);
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO users (id, name, prodi, angkatan, role, password_salt, password_hash)
      VALUES ($1, $2, $3, $4, 'student', $5, $6)
      RETURNING id, name, prodi, angkatan, role, guest
    `, [id, name, prodi, angkatan, salt, hash]);
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
      'SELECT id, name, prodi, angkatan, role, guest, password_salt, password_hash FROM users WHERE LOWER(id) = LOWER($1)',
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

app.post('/api/auth/guest', (req, res) => {
  return res.status(410).json({ error: 'Mode tamu dengan data contoh sudah dinonaktifkan. Silakan daftar atau masuk dengan akun terdaftar.' });
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

app.get('/api/curriculum', authRequired, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'curriculum'");
    return res.json(result.rows[0]?.value || { meta: null, courses: [] });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/curriculum', authRequired, adminRequired, async (req, res, next) => {
  const rawCourses = req.body?.courses;
  const sourceFile = String(req.body?.sourceFile || 'Curriculum.xlsx').slice(0, 180);
  const program = String(req.body?.program || 'Program Studi').slice(0, 180);
  const institution = String(req.body?.institution || '').slice(0, 180);
  const sheet = String(req.body?.sheet || '').slice(0, 120);
  if (!Array.isArray(rawCourses) || rawCourses.length < 1 || rawCourses.length > 500) {
    return res.status(400).json({ error: 'File Excel tidak berisi data mata kuliah yang valid (1–500 baris).' });
  }

  const courses = [];
  for (const row of rawCourses) {
    const semester = Number(row?.semester);
    const sks = Number(row?.sks);
    const code = String(row?.code || '').trim().slice(0, 32);
    const name = String(row?.name || '').trim().slice(0, 180);
    if (!Number.isInteger(semester) || semester < 1 || semester > 14 ||
        !Number.isInteger(sks) || sks < 1 || sks > 12 || !name) {
      return res.status(400).json({ error: 'Ada baris Excel yang tidak valid. Periksa semester, nama mata kuliah, dan SKS.' });
    }
    courses.push({
      semester,
      code,
      name,
      category: String(row?.category || '').trim().slice(0, 120),
      sks,
      prerequisite: String(row?.prerequisite || '').trim().slice(0, 500),
      notes: String(row?.notes || '').trim().slice(0, 500)
    });
  }

  const duplicateCodes = Object.entries(courses.reduce((map, course) => {
    if (course.code) map[course.code] = (map[course.code] || 0) + 1;
    return map;
  }, {})).filter(([, count]) => count > 1).map(([code]) => code);

  const curriculum = {
    meta: {
      sourceFile,
      program,
      institution,
      sheet,
      importedAt: new Date().toISOString(),
      importedBy: req.user.id,
      courseCount: courses.length,
      semesterCount: new Set(courses.map(course => course.semester)).size,
      duplicateCodes
    },
    courses
  };

  try {
    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('curriculum', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [JSON.stringify(curriculum)]);
    return res.json({ ok: true, meta: curriculum.meta });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/admin/students/:id/angkatan', authRequired, adminRequired, async (req, res, next) => {
  const angkatan = Number(req.body?.angkatan);
  if (!Number.isInteger(angkatan) || angkatan < 2000 || angkatan > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Tahun angkatan tidak valid.' });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET angkatan = $1 WHERE id = $2 AND role = 'student' AND guest = FALSE RETURNING id, angkatan",
      [angkatan, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Akun mahasiswa tidak ditemukan.' });
    return res.json({ ok: true, student: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/students', authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.prodi, u.angkatan, u.guest, COALESCE(d.state, '{}'::jsonb) AS data
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
  res.json({
    ok: true,
    service: 'ceklulus-ai-backend',
    persistentDatabaseConfigured: Boolean(process.env.DATABASE_URL) && process.env.USE_PG_MEM === 'false',
    aiConfigured: Boolean(groq),
    authConfigured: Boolean(process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length >= 32)
  });
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

app.post('/api/ai/chat', authRequired, async (req, res) => {
  const { message = '' } = req.body || {};

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Konsultasi Lulu hanya tersedia untuk akun mahasiswa.' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  }
  if (String(message).length > 4000) {
    return res.status(400).json({ error: 'Pertanyaan terlalu panjang. Maksimal 4.000 karakter.' });
  }

  if (!groq) {
    return res.status(503).json({ error: 'GROQ_API_KEY belum dikonfigurasi di Render.' });
  }

  try {
    // Use records from the authenticated account. Do not trust client-submitted
    // student IDs, grades, cohort values, or curriculum context.
    const [dataResult, settingsResult, curriculumResult] = await Promise.all([
      pool.query('SELECT state FROM student_data WHERE user_id = $1', [req.user.id]),
      pool.query("SELECT value FROM app_settings WHERE key = 'study_rules'"),
      pool.query("SELECT value FROM app_settings WHERE key = 'curriculum'")
    ]);
    const state = dataResult.rows[0]?.state || initialStudentData(req.user.guest);
    const curriculum = curriculumResult.rows[0]?.value || { courses: [] };
    const student = {
      name: req.user.name || 'Mahasiswa',
      id: req.user.id,
      role: req.user.role,
      prodi: req.user.prodi || '',
      angkatan: req.user.angkatan ? Number(req.user.angkatan) : null,
      cfg: settingsResult.rows[0]?.value || DEFAULT_SETTINGS,
      khs: {
        semesters: (Array.isArray(state.sems) ? state.sems : []).map(group => ({
          semester: Number(group.n) || null,
          courses: (Array.isArray(group.c) ? group.c : []).map(course => ({
            name: String(course.name || ''),
            code: String(course.curriculumCode || course.code || ''),
            sks: Number(course.sks) || 0,
            grade: String(course.g || ''),
            curriculumStatus: course.curriculumStatus || 'unknown',
            curriculumSemester: course.curriculumSemester || null,
            prerequisite: course.curriculumPrerequisite || ''
          }))
        }))
      },
      curriculum: Array.isArray(curriculum.courses) ? curriculum.courses : []
    };
    const summary = summarizeStudent(student);
    const graduationAnalysis = calculateGraduationAnalysis(student, summary);
    const prompt = `Data akademik dari akun yang sedang masuk (bersumber dari database server):
${JSON.stringify({
      name: student.name,
      id: student.id,
      prodi: student.prodi,
      angkatan: student.angkatan,
      cfg: student.cfg,
      khs: student.khs,
      curriculum: student.curriculum,
      summary,
      graduationAnalysis
    }, null, 2)}

Pertanyaan: ${message}`;
    const historyMessages = (Array.isArray(state.chat) ? state.chat.slice(-11, -1) : [])
      .map(turn => ({
        role: turn.r === 'u' ? 'user' : 'assistant',
        content: String(turn.h || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1800)
      }))
      .filter(turn => turn.content);

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
            { role: 'system', content: 'Kamu Lulu, penasihat akademik personal CekLulus. Jawab dalam Bahasa Indonesia dengan ramah, jelas, terstruktur, dan praktis. Gunakan data KHS, hasil pencocokan kurikulum Excel, ringkasan progres, angkatan, analisis kelulusan, dan prasyarat yang disertakan pada konteks mahasiswa. Bila ditanya kapan lulus, gunakan estimasi semester dan tahun akademik dari analisis server hanya bila angkatan tersedia; jelaskan asumsi beban SKS dan mata kuliah wajib yang belum tuntas. Jangan menyebut estimasi sebagai keputusan resmi. Bila prasyarat pada Excel tidak dapat dicocokkan atau ada kode/nama duplikat, nyatakan keterbatasan itu dan jangan menebak. Bedakan data yang benar-benar tercatat dengan rekomendasi. Jangan mengarang kebijakan kampus, dosen, jadwal, nilai, atau kelulusan. Bila data penting tidak tersedia, katakan apa yang kurang dan ajukan satu pertanyaan klarifikasi. Jawab inti pertanyaan 1–5 kalimat; gunakan daftar atau langkah bila membantu.' },
            ...historyMessages,
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
