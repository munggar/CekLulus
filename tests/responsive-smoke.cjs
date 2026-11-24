const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '..');
const xlsxBrowserBundle = fs.readFileSync(path.join(path.dirname(require.resolve('xlsx')), 'dist', 'xlsx.full.min.js'), 'utf8');
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
    await page.addScriptTag({ content: xlsxBrowserBundle });
    await page.waitForSelector('#auth input');

    await page.evaluate((data) => {
      USER = { id: '2403045007', name: 'Munggar Fajar Muharram', prodi: 'Sistem dan Teknologi Informasi', angkatan: 2023, role: 'student' };
      NAME = 'Munggar';
      AUTH_TOKEN = 'responsive-test';
      CFG = { total: 144, maxSem: 14, minIpk: 2 };
      CURRICULUM = data.courses;
      CURRICULUM_META = { sourceFile: data.sourceFile, program: data.program, courseCount: data.courses.length };
      st = seed();
      shell(true);
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
        assert.ok(metrics.titleVisible, `Page heading extends beyond viewport at ${width}px on ${tab}: ${JSON.stringify(metrics)}`);
        assert.equal(metrics.titleDescriptionOverlap, false, `Chat title overlaps supporting text at ${width}px`);
        results.push({ width, tab, scrollWidth: metrics.scrollWidth });
      }

      await page.evaluate(() => {
        USER = { id: '2403045007', name: 'Munggar Fajar Muharram', prodi: 'Sistem dan Teknologi Informasi', angkatan: 2023, role: 'student' };
        shell(true);
        render();
        upModal();
      });
      await page.waitForTimeout(20);
      const khsModal = await page.evaluate(() => {
        const modal = document.querySelector('#modal>div>div');
        const rect = modal?.getBoundingClientRect();
        return { viewport: window.innerWidth, width: rect?.width || 0, left: rect?.left || 0, right: rect?.right || 0, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.ok(khsModal.width > 0 && khsModal.width <= width + 1 && khsModal.left >= -1 && khsModal.right <= width + 1 && khsModal.scrollWidth <= width + 1,
        `KHS upload modal overflows at ${width}px: ${JSON.stringify(khsModal)}`);
      await page.evaluate(() => closeM());
      results.push({ width, tab: 'khs-upload-modal', scrollWidth: khsModal.scrollWidth });

      await page.evaluate(() => {
        USER = { id: 'admin-test', name: 'Admin CekLulus', role: 'admin' };
        shell(true);
        render();
      });
      await page.waitForTimeout(35);
      const adminWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(adminWidth <= width + 1, `Admin dashboard overflows at ${width}px: ${adminWidth}`);
      results.push({ width, tab: 'admin', scrollWidth: adminWidth });

      await page.evaluate(() => cfgModal());
      await page.waitForTimeout(20);
      const adminModal = await page.evaluate(() => {
        const modal = document.querySelector('#modal>div>div');
        const rect = modal?.getBoundingClientRect();
        return { viewport: window.innerWidth, width: rect?.width || 0, left: rect?.left || 0, right: rect?.right || 0, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.ok(adminModal.width > 0 && adminModal.width <= width + 1 && adminModal.left >= -1 && adminModal.right <= width + 1 && adminModal.scrollWidth <= width + 1,
        `Admin rules modal overflows at ${width}px: ${JSON.stringify(adminModal)}`);
      await page.evaluate(() => closeM());
      results.push({ width, tab: 'admin-rules-modal', scrollWidth: adminModal.scrollWidth });

      await page.evaluate(() => {
        USER = { id: '2403045007', name: 'Munggar Fajar Muharram', prodi: 'Sistem dan Teknologi Informasi', angkatan: 2023, role: 'student' };
        shell(true);
        render();
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


    // Verify the complete Excel preview and admin import action at a narrow viewport.
    await page.setViewportSize({ width: 320, height: 950 });
    let importedPayload = null;
    let activeCurriculum = curriculum;
    await page.route('**/api/curriculum', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        meta: { sourceFile: 'responsive-import.xlsx', program: 'Sistem dan Teknologi Informasi (S1)', courseCount: activeCurriculum.length },
        courses: activeCurriculum
      })
    }));
    await page.route('**/api/admin/students', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ students: [] })
    }));
    await page.route('**/api/admin/curriculum', async route => {
      importedPayload = route.request().postDataJSON();
      activeCurriculum = importedPayload.courses;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, meta: { courseCount: activeCurriculum.length, sourceFile: importedPayload.sourceFile } })
      });
    });
    await page.evaluate(() => {
      USER = { id: 'admin-test', name: 'Admin CekLulus', role: 'admin' };
      shell(true);
      render();
    });

    const hasBrowserXlsx = await page.evaluate(() => !!window.XLSX && typeof window.XLSX.read === 'function');
    assert.equal(hasBrowserXlsx, true, 'SheetJS must be available in the browser before parsing the workbook.');

    const importBook = XLSX.utils.book_new();
    const importRows = [
      ['Program Studi: Sistem dan Teknologi Informasi (S1)'],
      ['Universitas Muhammadiyah Prof. DR. HAMKA'],
      [],
      ['semester', 'kode_mk', 'nama_mk', 'kategori', 'sks', 'Mata Kuliah Prasyarat', 'Keterangan / Catatan'],
      [1, '03045108', 'Pendidikan Agama', 'MKWU / AIK', 2, 'Tidak Ada', 'Wajib Semester 1'],
      [3, '03045081', 'Ketrampilan Komunikasi', 'Pengayaan / Soft Skill', 2, 'Tidak Ada', 'Dapat diambil di semester 3/5/7'],
      [5, '03045081', 'Ketrampilan Komunikasi', 'Matkul Pengayaan', 2, 'Tidak Ada', 'Dapat diambil di semester 3/5/7']
    ];
    XLSX.utils.book_append_sheet(importBook, XLSX.utils.aoa_to_sheet(importRows), 'Prasyarat Mata Kuliah');
    const importBuffer = XLSX.write(importBook, { bookType: 'xlsx', type: 'buffer' });
    await page.locator('#curriculum_excel').setInputFiles({
      name: 'DATA MK UNTUK-ADMIN COURSE RECOM.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: importBuffer
    });
    const inputState = await page.evaluate(() => ({
      fileCount: document.querySelector('#curriculum_excel')?.files?.length || 0,
      fileName: document.querySelector('#curriculum_excel')?.files?.[0]?.name || '',
      handler: document.querySelector('#curriculum_excel')?.getAttribute('onchange'),
      parser: typeof previewCurriculumExcel
    }));
    assert.equal(inputState.fileCount, 1, `Excel file must be attached to the admin input: ${JSON.stringify(inputState)}`);
    assert.equal(inputState.parser, 'function', 'Admin Excel parser must be available.');
    await page.evaluate(() => previewCurriculumExcel(document.querySelector('#curriculum_excel')));
    await page.waitForFunction(() => (document.querySelector('#curriculum-preview')?.innerText || '').trim().length > 0);
    const preview = await page.evaluate(() => ({
      text: document.querySelector('#curriculum-preview')?.innerText || '',
      draftCount: Array.isArray(CURRICULUM_DRAFT) ? CURRICULUM_DRAFT.length : 0,
      saveDisabled: document.querySelector('#curriculum-import-button')?.disabled,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    assert.equal(preview.draftCount, 3, `Excel parser should extract three valid rows. Preview output: ${preview.text}`);
    assert.equal(preview.saveDisabled, false, 'Valid Excel preview should enable the import action.');
    assert.match(preview.text, /3 MATA KULIAH/, 'Excel preview should show all three valid rows.');
    assert.match(preview.text, /03045081/, 'Excel preview should warn about the duplicate source code.');
    assert.ok(preview.scrollWidth <= preview.viewport + 1, 'Excel preview must not create page-level horizontal overflow at 320px.');

    await page.evaluate(() => importCurriculum());
    await page.locator('#modal button').filter({ hasText: 'Ya, impor data' }).click();
    await page.waitForFunction(() => !!CURRICULUM_META && CURRICULUM.length === 3);
    assert.ok(importedPayload, 'Admin import endpoint should receive the parsed workbook.');
    assert.equal(importedPayload.courses.length, 3);
    assert.equal(importedPayload.sourceFile, 'DATA MK UNTUK-ADMIN COURSE RECOM.xlsx');
    assert.equal(importedPayload.sheet, 'Prasyarat Mata Kuliah');
    assert.equal(importedPayload.courses[2].semester, 5);
    assert.equal(importedPayload.courses[2].code, '03045081');

    // Confirm that the semester inference uses the workbook's allowed-semester note.
    const inferred = await page.evaluate(() => assignKhsSemesters([{
      n: 7,
      c: [{
        name: 'Ketrampilan Komunikasi',
        code: '03045081',
        curriculumCode: '03045081',
        sks: 2,
        g: 'A',
        t: 'P'
      }]
    }], 7, false));
    assert.equal(inferred[0].n, 7, 'A course allowed in semester 3/5/7 should stay in semester 7 when reviewed there.');
    assert.equal(inferred[0].c[0].curriculumStatus, 'matched');

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
