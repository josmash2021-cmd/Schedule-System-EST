const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560 });
  page.on('console', m => console.log('CONSOLE:', m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  const url = 'file:///' + path.resolve('diag-mapa.html').split(path.sep).join('/');
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction('window.__done === true', { timeout: 30000 }).catch(() => console.log('TIMEOUT __done'));
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'diag-mapa.png' });
  await browser.close();
})();
