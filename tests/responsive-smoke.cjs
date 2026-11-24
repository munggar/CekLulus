const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const curriculum = require(path.join(root, 'server/data/curriculum-sti.json'));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

async function main() {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block'
  });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#auth input');

    await page.evaluate((data) => {
      USER = { id: '2403045007', name: 'Munggar Fajar Muharram', prodi: 'Sistem dan Teknologi Informasi', angkatan: 2023, role: 'student' };
      NAME = 'Munggar';
      AUTH_TOKEN = 'responsive-test';
      CFG = { total: 144, maxSem: 14, minIpk: 2 };
      CURRICULUM = data.courses;
      CURRICULUM_META = { sourceFile: data.sourceFile, program: data.program, courseCount: data.courses.length };
      st = seed();
      st.sems = [
        { n: 1, c: [
          { name: 'Pendidikan Agama', code: '03045108', curriculumCode: '03045108', sks: 2, g: 'A', t: 'W' },
          { name: 'Kalkulus', code: '03045101', curriculumCode: '03045101', sks: 3, g: 'B+', t: 'W' },
          { name: 'Matematika Diskrit', code: '03045012', curriculumCode: '03045012', sks: 3, g: 'B', t: 'W' }
        ] },
        { n: 2, c: [
          { name: 'Aqidah', code: '03045105', curriculumCode: '03045105', sks: 2, g: 'A', t: 'W' },
          { name: 'Struktur Data', code: '03045024', curriculumCode: '03045024', sks: 2, g: 'B', t: 'W' }
        ] }
      ];
      ADMIN_STUDENTS = [{
        id: '2403045007',
        name: 'Munggar Fajar Muharram',
        prodi: 'Sistem dan Teknologi Informasi',
        angkatan: 2023,
        guest: false,
        data: { sems: st.sems }
      }];
      render();
    }, curriculum);

    const widths = [320, 360, 375, 414, 768, 1024, 1280, 1440, 1920];
    const tabs = ['chat', 'ringkasan', 'matkul', 'simulasi', 'riwayat'];
    const results = [];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 950 });
      for (const tab of tabs) {
        await page.evaluate(tabName => go(tabName), tab);
        await page.waitForTimeout(35);
        const metrics = await page.evaluate(() => {
          const app = document.querySelector('#app');
          const root = document.documentElement;
          const title = app?.querySelector('h1');
          const description = tab === 'chat' ? app?.querySelector('p') : null;
          const titleRect = title?.getBoundingClientRect();
          const descriptionRect = description?.getBoundingClientRect();
          return {
            width: window.innerWidth,
            scrollWidth: root.scrollWidth,
            appWidth: app?.getBoundingClientRect().width || 0,
            titleVisible: !title || (titleRect.width > 0 && titleRect.left >= -2 && titleRect.right <= window.innerWidth + 2),
            titleRect: titleRect ? { left:titleRect.left, right:titleRect.right, top:titleRect.top, bottom:titleRect.bottom, width:titleRect.width, font:getComputedStyle(title).fontSize, text:title.textContent } : null,
            appRect: app ? { left:app.getBoundingClientRect().left, right:app.getBoundingClientRect().right, width:app.getBoundingClientRect().width } : null,
            titleDescriptionOverlap: !!(titleRect && descriptionRect &&
              titleRect.left < descriptionRect.right &&
              titleRect.right > descriptionRect.left &&
              titleRect.top < descriptionRect.bottom &&
              titleRect.bottom > descriptionRect.top)
          };
        });
        assert.ok(metrics.scrollWidth <= width + 1, `Horizontal overflow at ${width}px on ${tab}: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.titleVisible, `Page heading extends beyond viewport at ${width}px on ${tab}`);
        assert.equal(metrics.titleDescriptionOverlap, false, `Chat title overlaps supporting text at ${width}px`);
        results.push({ width, tab, scrollWidth: metrics.scrollWidth });
      }

      await page.evaluate(() => {
        USER = { id: 'admin-test', name: 'Admin CekLulus', role: 'admin' };
        render();
      });
      await page.waitForTimeout(35);
      const adminWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(adminWidth <= width + 1, `Admin dashboard overflows at ${width}px: ${adminWidth}`);
      results.push({ width, tab: 'admin', scrollWidth: adminWidth });

      await page.evaluate(() => {
        USER = { id: '2403045007', name: 'Munggar Fajar Muharram', prodi: 'Sistem dan Teknologi Informasi', angkatan: 2023, role: 'student' };
        profile();
      });
      await page.waitForTimeout(20);
      const modalWidth = await page.evaluate(() => {
        const modal = document.querySelector('#modal>div>div');
        const rect = modal?.getBoundingClientRect();
        return { viewport: window.innerWidth, width: rect?.width || 0, left: rect?.left || 0, right: rect?.right || 0 };
      });
      assert.ok(modalWidth.width <= width + 1 && modalWidth.left >= -1 && modalWidth.right <= width + 1,
        `Profile modal overflows at ${width}px: ${JSON.stringify(modalWidth)}`);
      await page.evaluate(() => closeM());
      results.push({ width, tab: 'profile-modal', scrollWidth: width });
    }

    assert.deepEqual(pageErrors, [], `Unexpected browser JavaScript errors: ${pageErrors.join('; ')}`);
    console.log(`Responsive smoke test passed: ${results.length} page/viewport checks across ${widths.join(', ')}px.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
