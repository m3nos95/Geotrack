/**
 * Capture GeoTrak README screenshots (auth bypassed for docs only).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'readme-screenshots');
const PORT = 8765;
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

fs.mkdirSync(OUT, { recursive: true });

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/') u = '/Geo_Report_Center.html';
  const fp = path.join(ROOT, u.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType(fp) });
  fs.createReadStream(fp).pipe(res);
});

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function shot(page, name, opts={}) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: !!opts.fullPage, type: 'png' });
  console.log('wrote', name, fs.statSync(file).size);
}

async function unlock(page) {
  await page.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.remove();
    const gate = document.getElementById('authGate');
    if (gate) gate.classList.add('hidden');
    // enable estimates for richer screenshots
    try {
      localStorage.setItem('geotrak_estimates', '1');
      if (typeof setEstimatesEnabled === 'function') setEstimatesEnabled(true);
      else {
        const b = document.getElementById('hdrBtnEstimates');
        if (b && !b.classList.contains('on')) b.click();
      }
    } catch (_) {}
  });
  await sleep(400);
}

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // 1) Auth gate
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1500);
  // dismiss splash if present but keep auth for first shot
  await page.evaluate(() => { const s=document.getElementById('splash'); if(s){ const b=document.getElementById('splashAck'); if(b) b.click(); else s.remove(); }});
  await sleep(800);
  await shot(page, '01-sign-in.png');

  // Create account tab
  await page.evaluate(() => { const b=document.getElementById('authModeSignUp'); if(b) b.click(); });
  await sleep(400);
  await shot(page, '02-create-account.png');

  // Connection settings open
  await page.evaluate(() => {
    const b=document.getElementById('authModeSignIn'); if(b) b.click();
    const d=document.querySelector('#authGate details.auth-adv'); if(d) d.open=true;
  });
  await sleep(400);
  await shot(page, '03-connection-settings.png');

  await unlock(page);
  await sleep(1200);
  await shot(page, '04-map-home.png');

  // Header tools popovers
  await page.click('#hdrBtnLayers');
  await sleep(500);
  await shot(page, '05-layers-popover.png');
  await page.evaluate(() => document.getElementById('hdrPop')?.classList.remove('open'));
  await page.click('#hdrBtnMarkers');
  await sleep(400);
  await shot(page, '06-markers-popover.png');
  await page.evaluate(() => document.getElementById('hdrPop')?.classList.remove('open'));
  await page.click('#hdrBtnHydro');
  await sleep(400);
  await shot(page, '07-hydro-popover.png');
  await page.evaluate(() => document.getElementById('hdrPop')?.classList.remove('open'));

  // Click map center-ish (Delaware)
  const mapBox = await page.$('#map');
  const box = await mapBox.boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.48);
  await sleep(2500);
  await shot(page, '08-site-intel-brief.png');

  // Cycle a few HUD tabs
  for (const [tab, file] of [
    ['estimate', '09-site-intel-infil.png'],
    ['site', '10-site-intel-site.png'],
    ['dna', '11-site-intel-dna.png'],
    ['borings', '12-site-intel-borings.png'],
    ['hydro', '13-site-intel-hydro.png'],
  ]) {
    await page.evaluate((t) => { if (typeof setHudTab==='function') setHudTab(t); }, tab);
    await sleep(900);
    await shot(page, file);
  }

  // Right rail boring request / limits - ensure panel visible
  await page.evaluate(() => {
    const p=document.getElementById('qPanel');
    if(p) p.classList.remove('qbody-hidden');
  });
  await sleep(400);
  await shot(page, '14-right-rail-tools.png');

  // Other pages
  await page.click('button.tab[data-p="refs"]');
  await sleep(700);
  await shot(page, '15-reference-data.png');
  await page.click('button.tab[data-p="jobs"]');
  await sleep(700);
  await shot(page, '16-jobs.png');
  await page.click('button.tab[data-p="report"]');
  await sleep(700);
  await shot(page, '17-report.png');

  await browser.close();
  server.close();
  console.log('done', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
