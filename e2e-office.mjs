import { chromium } from '@playwright/test';

const URL = 'http://localhost:5199/e2e-check.html';
const browser = await chromium.launch();
const page = await browser.newPage();

const log = [];
page.on('console', (m) => log.push(`[console:${m.type()}] ${m.text()}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Success = the office chunks were ACKed end-to-end: renderOffice flips the iframe to display:block.
try {
  await page.waitForFunction(
    () => {
      const iframe = document.querySelector('#r-preview-mask iframe');
      return iframe && iframe.style.display === 'block';
    },
    { timeout: 60000 },
  );
  console.log('RESULT: PASS — iframe visible, RENDER_OFFICE chunks acknowledged by edit.chaxus.com');
} catch {
  const state = await page.evaluate(() => {
    const mask = document.getElementById('r-preview-mask');
    const iframe = mask?.querySelector('iframe');
    return {
      iframeSrc: iframe?.getAttribute('src'),
      iframeDisplay: iframe?.style.display,
      loading: mask?.querySelector('.r-preview-loading-text')?.innerText,
    };
  });
  console.log('RESULT: FAIL', JSON.stringify(state));
}

// Give the editor a few seconds to actually render the document, then screenshot.
await page.waitForTimeout(12000);
await page.screenshot({ path: new globalThis.URL('./e2e-office.png', import.meta.url).pathname, fullPage: false });
console.log(
  log
    .filter((l) => !l.includes('vite'))
    .slice(0, 15)
    .join('\n'),
);
await browser.close();
