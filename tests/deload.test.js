// Early deload prompt after two consecutive short sessions.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let srv, browser, page;
before(async () => { srv = await h.startServer(); browser = await h.launch(); page = await h.newPage(browser, srv.url); });
after(async () => { await browser.close(); srv.server.close(); });

test('two short sessions in a row prompt a deload; accepting jumps to week 5', async () => {
  for (let i = 0; i < 3; i++) { await h.doSession(page, 9); await h.closeDone(page); }
  let m = await h.doSession(page, 7);
  assert.doesNotMatch(m, /Take your deload now\?/, 'one short session is not enough');
  await h.closeDone(page);
  m = await h.doSession(page, 7);
  assert.match(m, /Take your deload now\?/);
  await page.click('#modal button:has-text("Not yet")');
  assert.doesNotMatch(await page.textContent('#modal-inner'), /Take your deload/);
  await h.closeDone(page);
  assert.doesNotMatch(await page.textContent('#app'), /Take your deload/);

  m = await h.doSession(page, 6);
  assert.match(m, /Take your deload now\?/, 'offered again on the next short session');
  await h.closeDone(page);
  assert.match(await page.textContent('#app'), /Take your deload now\?/, 'banner stays on Home');
  await page.click('#app button.rp-btn.primary:has-text("Deload now")');
  const card = await page.textContent('.today-card');
  assert.match(card, /Block 1 · Week 5 · Day A/);
  assert.match(card, /RIR 4–5/);
});

test('deload week: 2 sets, deload load, no feedback, rolls into block 2', async () => {
  await page.click('.today-card'); await page.waitForSelector('.ex-card');
  assert.equal(await page.locator('#ec-leg-press .rp-set').count(), 2);
  assert.match(await page.textContent('#ec-leg-press'), /Deload/);
  await h.doSession(page, 5); await h.closeDone(page);
  await h.doSession(page, 5); await h.closeDone(page);
  const m = await h.doSession(page, 5);
  assert.doesNotMatch(m, /Take your deload/);
  assert.match(m, /Block 2 · Week 1 · Day A/);
  assert.deepEqual(page.errors, []);
});
