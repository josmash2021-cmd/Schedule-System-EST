const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('https://electronicservicetechnology.com/track?t=e76a12682b474c002e4d6f1fef1ae003774c0e1108035ef17c20fd7583ac1083', { waitUntil: 'networkidle2' });
  await page.waitForFunction('window.__trackPts && window.__trackPts.from', { timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  const res = await page.evaluate(() => {
    const map = window.__trackMap, pts = window.__trackPts;
    const canvas = map.getCanvas().getBoundingClientRect();
    return [...document.querySelectorAll('.mapboxgl-marker')].map((m, i) => {
      const r = m.getBoundingClientRect();
      const key = i === 0 ? 'from' : 'to';
      const p = map.project(pts[key]);
      return {
        i, transform: m.style.transform,
        rect: { top: r.top, bottom: r.bottom, left: r.left, w: r.width, h: r.height },
        projScreen: { x: canvas.left + p.x, y: canvas.top + p.y },
        offsetHeight: m.offsetHeight,
        computedTransform: getComputedStyle(m).transform
      };
    });
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})();
