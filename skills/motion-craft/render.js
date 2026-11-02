// render.js — Motion Craft Pro 逐帧渲染器 v2.0.0
// 用法: node render.js <html路径> <输出目录> [fps] [时长秒]
// 画幅由 film.html canvas 尺寸决定（默认 1920×1080）
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function loadPuppeteer() {
  const tried = [];
  try {
    return require('puppeteer-core');
  } catch (e) {
    tried.push(`默认解析失败: ${e.code || e.message.split('\n')[0]}`);
  }

  const home = os.homedir();
  const roots = [
    process.env.PUPPETEER_CORE_ROOT,
    process.env.NODE_PATH,
    path.join(home, 'node_modules'),
    path.join(home, '.workbuddy-ai', 'binaries', 'node', 'workspace', 'node_modules'),
    // monorepo / local smoke test deps
    path.resolve(__dirname, '..', '..', '..', 'node_deps', 'node_modules'),
    path.resolve(__dirname, '..', '..', '..', '..', 'node_deps', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean);

  for (const root of roots) {
    for (const r of String(root).split(path.delimiter)) {
      if (!r) continue;
      const p = path.join(r, 'puppeteer-core');
      if (!fs.existsSync(p)) continue;
      try {
        return require(p);
      } catch (e) {
        tried.push(`${p}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  try {
    const g = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const p = path.join(g, 'puppeteer-core');
    if (fs.existsSync(p)) return require(p);
    tried.push(`npm root -g: ${g} 下没有 puppeteer-core`);
  } catch (e) {
    tried.push('npm root -g 执行失败');
  }

  throw new Error(
    '找不到 puppeteer-core。\n' +
    '  安装：npm i puppeteer-core\n' +
    '  或设置 PUPPETEER_CORE_ROOT / NODE_PATH\n' +
    '尝试过：\n  ' + tried.join('\n  ')
  );
}

const puppeteer = loadPuppeteer();

function findChrome() {
  const home = os.homedir();
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    // Playwright chromium (Windows)
    ...(fs.existsSync(`${home}/AppData/Local/ms-playwright`)
      ? fs.readdirSync(`${home}/AppData/Local/ms-playwright`)
          .filter(d => d.startsWith('chromium-'))
          .sort().reverse()
          .map(d => `${home}/AppData/Local/ms-playwright/${d}/chrome-win64/chrome.exe`)
      : []),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  throw new Error('找不到 Chrome/Chromium。请设置环境变量 CHROME_PATH。');
}

const CHROME = findChrome();

(async () => {
  const htmlPath = path.resolve(process.argv[2]);
  const outDir = path.resolve(process.argv[3]);
  const fps = parseInt(process.argv[4] || '30', 10);
  let duration = parseFloat(process.argv[5] || '0');

  if (!fs.existsSync(htmlPath)) {
    throw new Error('HTML 不存在: ' + htmlPath);
  }

  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Motion Craft Pro render`);
  console.log(`  chrome: ${CHROME}`);
  console.log(`  html:   ${htmlPath}`);
  console.log(`  out:    ${outDir}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--force-device-scale-factor=1',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--hide-scrollbars'
    ]
  });

  const page = await browser.newPage();
  // provisional viewport; will resize to canvas
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const url = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });

  const meta = await page.evaluate(() => {
    const c = document.getElementById('c');
    return {
      w: c.width,
      h: c.height,
      duration: (typeof window.__DURATION === 'number') ? window.__DURATION : null,
      fps: (typeof window.__FPS === 'number') ? window.__FPS : null
    };
  });
  await page.setViewport({ width: meta.w, height: meta.h, deviceScaleFactor: 1 });
  if (!duration || duration <= 0) {
    duration = meta.duration || 10;
  }
  console.log(`  canvas: ${meta.w}x${meta.h}`);
  console.log(`  fps: ${fps}  duration: ${duration}s`);

  if (meta.w < 1280 || meta.h < 720) {
    console.warn('  WARN: 画幅低于 Pro 建议的 1080p 级，建议 1920×1080 / 1440×1080 / 1080×1920');
  }

  const total = Math.round(fps * duration);
  const t0 = Date.now();
  let lastPct = -1;

  for (let i = 0; i < total; i++) {
    const t = i / fps;
    const dataUrl = await page.evaluate((tt) => {
      window.renderFrame(tt);
      return document.getElementById('c').toDataURL('image/png');
    }, t);
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    fs.writeFileSync(
      path.join(outDir, `frame_${String(i).padStart(4, '0')}.png`),
      Buffer.from(b64, 'base64')
    );
    const pct = Math.floor((i / total) * 100);
    if (pct !== lastPct && (pct % 5 === 0 || i === total - 1)) {
      lastPct = pct;
      const elapsed = (Date.now() - t0) / 1000;
      const eta = i > 0 ? (elapsed / i) * (total - i) : 0;
      process.stdout.write(`\r  ${i + 1}/${total}  ${pct}%  elapsed ${elapsed.toFixed(1)}s  eta ${eta.toFixed(1)}s   `);
    }
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  done ${total} frames in ${sec}s  (${(total / parseFloat(sec)).toFixed(1)} fps render)`);
  await browser.close();
})().catch(e => { console.error('RENDER FAILED:', e.message); process.exit(1); });
