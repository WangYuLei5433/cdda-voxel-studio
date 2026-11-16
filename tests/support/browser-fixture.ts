// Playwright `test` with a browser log: every page's console (the engine Worker's
// included), uncaught page errors, failed requests and the engine's debug messages (with
// their WASM call stack, see vendor/cdda/src/debug.cpp). The log is attached to every test
// (browser-log.txt in the HTML report); on failure it is also printed, so the reason shows
// up in the terminal / CI output without opening the trace.
import { test as base, expect, type Page } from '@playwright/test';

export interface BrowserLog {
  lines: string[];
  /** Uncaught page errors and console errors (engine debug messages count as errors). */
  errors: string[];
}

function watch(page: Page, log: BrowserLog, label: string): void {
  const t0 = Date.now();
  const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  page.on('console', (m) => {
    const text = m.text();
    // The engine's frame-by-frame chatter is noise; keep everything else.
    if (text.startsWith('[cdda]') && !/debugmsg|error|warn/i.test(text)) return;
    const line = `${stamp()} ${label} console.${m.type()}: ${text}`;
    log.lines.push(line);
    if (m.type() === 'error' || text.includes('debugmsg:')) log.errors.push(line);
  });
  page.on('pageerror', (e) => {
    const line = `${stamp()} ${label} pageerror: ${e.stack ?? e.message}`;
    log.lines.push(line);
    log.errors.push(line);
  });
  page.on('requestfailed', (r) => log.lines.push(`${stamp()} ${label} requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('worker', (w) => log.lines.push(`${stamp()} ${label} worker started: ${w.url()}`));
  page.on('crash', () => {
    const line = `${stamp()} ${label} PAGE CRASHED`;
    log.lines.push(line);
    log.errors.push(line);
  });
}

export const test = base.extend<{ browserLog: BrowserLog }>({
  browserLog: [
    async ({ page, context }, use, testInfo) => {
      const log: BrowserLog = { lines: [], errors: [] };
      watch(page, log, 'page');
      // Pages a test opens itself (browser.newPage / context.newPage) are watched too.
      context.on('page', (p) => p !== page && watch(p, log, 'page2'));
      await use(log);
      await testInfo.attach('browser-log.txt', { body: log.lines.join('\n') || '(empty)', contentType: 'text/plain' });
      if (testInfo.status !== testInfo.expectedStatus) {
        console.log(`\n── browser log: ${testInfo.title} ──\n${log.lines.slice(-200).join('\n')}\n`);
      }
    },
    { auto: true },
  ],
});

export { expect };
