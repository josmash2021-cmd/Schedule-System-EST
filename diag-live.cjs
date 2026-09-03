const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto('https://electronicservicetechnology.com/track?t=e76a12682b474c002e4d6f1fef1ae003774c0e1108035ef17c20fd7583ac1083', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#trackMap canvas', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => document.getElementById('trackGrid').scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 6500));
  await (await page.$('#trackGrid')).screenshot({ path: 'diag-grid.png' });
  await browser.close();
  console.log('ok');
})();
