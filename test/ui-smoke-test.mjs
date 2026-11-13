/**
 * Browser smoke test for the ParaFin UI (index.html opened via file://).
 *
 * Covers the interactions that are easy to break and not reachable from the
 * Node API tests: automatic re-fit, wheel zoom/pan/reset, validation chip,
 * auto-save, file naming and downloads, drag-and-drop loading.
 *
 * Playwright is not a dependency of this package; install it where you run
 * the test:
 *     npm install --no-save playwright && npx playwright install chromium
 *     npm run test:ui
 * (An already-installed Playwright is found through NODE_PATH as well.)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

let chromium;
try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch (e) {
    console.error('Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium');
    process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(path.join(root, 'index.html')).href;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parafin-ui-'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 800 }, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

let passed = 0;
async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ok   ' + name);
    } catch (e) {
        console.error('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]);
        process.exitCode = 1;
    }
}

const settle = (ms = 150) => page.waitForTimeout(ms);
const rect = (sel) => page.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, sel);
const download = async (sel) => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
    const file = path.join(tmp, d.suggestedFilename());
    await d.saveAs(file);
    return { name: d.suggestedFilename(), file };
};
// Bounding box of all drawn shapes in a view
const drawnBounds = (id) => page.evaluate(i => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    document.querySelectorAll('#' + i + 'Svg path, #' + i + 'Svg ellipse').forEach(el => {
        const q = el.getBoundingClientRect();
        l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    });
    return { left: l, top: t, right: r, bottom: b };
}, id);
const scaleLabel = (id) => page.textContent('#' + id + 'Svg .scale-indicator text');

await page.goto(pageUrl);
await settle(300);
console.log('ParaFin UI smoke test');

await check('renders both views with default parameters', async () => {
    assert.ok(await page.locator('#mainSvg path, #mainSvg ellipse').count() > 0);
    assert.ok(await page.locator('#detailSvg path').count() > 0);
});

await check('main view re-fits when the finger gets much larger', async () => {
    await page.fill('#fingerWidth', '40');
    await page.fill('#fingerHeight', '30');
    await settle();
    const c = await rect('#mainViewContainer'), g = await drawnBounds('main');
    assert.ok(g.left >= c.left && g.right <= c.right && g.top >= c.top && g.bottom <= c.bottom,
        'finger outline leaves the main view');
    await page.click('#resetButton');
    await settle();
});

await check('wheel zoom keeps the point under the cursor fixed', async () => {
    const box = await page.locator('#detailViewContainer').boundingBox();
    const px = box.x + box.width * 0.3, py = box.y + box.height * 0.6;
    const before = await drawnBounds('detail');
    await page.mouse.move(px, py);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
    await settle(250);
    const after = await drawnBounds('detail');
    const k = (after.right - after.left) / (before.right - before.left);
    assert.ok(k > 1.5, 'view did not zoom in');
    assert.ok(Math.abs(((px - before.left) * k + after.left) - px) < 1.5, 'x anchor moved');
    assert.ok(Math.abs(((py - before.top) * k + after.top) - py) < 1.5, 'y anchor moved');
});

await check('scale bar follows the zoom level', async () => {
    assert.notEqual(await scaleLabel('detail'), '2 mm');
});

await check('detail view keeps the palmar apex when finger height changes (zoomed)', async () => {
    const before = (await drawnBounds('detail')).bottom;
    await page.fill('#fingerHeight', '20');
    await settle();
    assert.ok(Math.abs((await drawnBounds('detail')).bottom - before) < 1.5, 'palmar apex moved');
    await page.fill('#fingerHeight', '14');
});

await check('double-click resets the view', async () => {
    await page.dblclick('#detailViewContainer', { position: { x: 100, y: 100 } });
    await settle(250);
    assert.equal(await scaleLabel('detail'), '2 mm');
});

await check('window resize re-fits the main view', async () => {
    await page.setViewportSize({ width: 900, height: 600 });
    await settle(300);
    const c = await rect('#mainViewContainer'), g = await drawnBounds('main');
    assert.ok(g.left >= c.left && g.right <= c.right && g.top >= c.top && g.bottom <= c.bottom);
    await page.setViewportSize({ width: 1400, height: 800 });
    await settle(300);
});

await check('invalid input shows a floating chip without moving the edited field', async () => {
    await page.evaluate(() => { document.querySelector('.parameters-panel').scrollTop = 0; });
    await settle();
    const top = (await rect('#fingerWidth')).top;
    await page.fill('#fingerWidth', '-3');
    await settle();
    assert.match(await page.textContent('.error-chip'), /error/);
    assert.equal((await rect('#fingerWidth')).top, top, 'the edited field moved');
    assert.ok(await page.isDisabled('#downloadGeoButton'));
    assert.ok(await page.isDisabled('#mainViewContainer [data-action=save-svg]'));
    await page.click('.error-chip');
    await page.click('.error-link >> nth=0');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fingerWidth');
    await page.fill('#fingerWidth', '20');
    await settle();
    assert.ok(await page.isHidden('#errorSummary'));
    assert.ok(await page.isEnabled('#downloadGeoButton'));
});

await check('slider is flagged when the value is outside its range', async () => {
    await page.fill('#fingerWidth', '55');
    await settle();
    assert.ok(await page.evaluate(() => document.getElementById('fingerWidthSlider').classList.contains('out-of-range')));
    await page.fill('#fingerWidth', '20');
});

await check('help button toggles an explanation', async () => {
    await page.click('label[for=fingerprintWavelength] .help-btn');
    assert.ok(await page.isVisible('#help-fingerprintWavelength'));
    await page.click('label[for=fingerprintWavelength] .help-btn');
    assert.ok(await page.isHidden('#help-fingerprintWavelength'));
});

await check('valid inputs survive a reload; invalid ones are not saved', async () => {
    await page.fill('#fingerWidth', '25');
    await settle(600);
    await page.fill('#fingerWidth', '-3');
    await settle(600);
    await page.reload();
    await settle(300);
    assert.equal(await page.inputValue('#fingerWidth'), '25');
    await page.click('#resetButton');
    await settle(600);
});

await check('downloads use default and custom file names', async () => {
    assert.equal((await download('#downloadButton')).name, 'parafin-project.json');
    assert.equal((await download('#downloadGeoButton')).name, 'parafin-model.geo');
    await page.fill('#exportFileName', 'my:finger/01');
    assert.equal((await download('#downloadButton')).name, 'my_finger_01.json');
    assert.equal((await download('#downloadGeoButton')).name, 'my_finger_01.geo');
    await page.fill('#exportFileName', '');
});

await check('SVG and PNG exports are valid files', async () => {
    const svg = await download('#mainViewContainer [data-action=save-svg]');
    assert.equal(svg.name, 'parafin-cross-section.svg');
    const text = fs.readFileSync(svg.file, 'utf8');
    assert.ok(text.includes('<svg') && text.includes('<path'));
    const png = await download('#detailViewContainer [data-action=save-png]');
    assert.equal(png.name, 'parafin-fingerprint-detail.png');
    assert.equal(fs.readFileSync(png.file).slice(1, 4).toString(), 'PNG');
});

await check('dropping a project file loads it; a bad file shows an error', async () => {
    const jsonFile = (await download('#downloadButton')).file;
    await page.fill('#fingerHeight', '10');
    const drop = async (name, content) => {
        const dt = await page.evaluateHandle(([n, c]) => {
            const d = new DataTransfer();
            d.items.add(new File([c], n, { type: 'application/json' }));
            return d;
        }, [name, content]);
        await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
        await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
        await settle(300);
    };
    await drop('project.json', fs.readFileSync(jsonFile, 'utf8'));
    assert.equal(await page.inputValue('#fingerHeight'), '14');
    await drop('bad.json', '{"x":1}');
    assert.match(await page.textContent('#errorPopover'), /Failed to load project/);
});

await check('no uncaught page errors', async () => {
    assert.deepEqual(pageErrors, []);
});

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' checks passed' + (process.exitCode ? ' (with failures)' : ''));
