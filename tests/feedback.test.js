// v2 feedback: per-muscle deltas, week-end minimum → bonus sets, flags.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let srv, browser, page;
before(async () => { srv = await h.startServer(); browser = await h.launch(); page = await h.newPage(browser, srv.url); });
after(async () => { await browser.close(); srv.server.close(); });

const tap = (m, label, q) => page.locator('#fb-' + m + ' .fb-seg').nth(q).locator('button', { hasText: label }).click();
const card = (m) => page.textContent('#fb-' + m);

test('feedback previews deltas and the week applies the lowest per muscle', async () => {
  await h.doSession(page, 10, { onFeedback: async () => {
    assert.equal(await page.locator('.fb-card').count(), 6);
    await tap('quads', 'Healed early', 0);
    assert.match(await card('quads'), /\+1 set/);
    await tap('hamstrings', 'Healed early', 0); await tap('hamstrings', '3', 2);
    assert.match(await card('hamstrings'), /hold/);
    await tap('back', 'Healed early', 0); await tap('back', 'Yes', 3);
    assert.match(await card('back'), /flagged/);
    await tap('sideDelts', 'Healed early', 0);
  } });
  await h.closeDone(page);

  // Day B: leave feedback, then come back via the Home banner
  await page.click('.today-card'); await page.waitForSelector('.ex-card');
  for (const r of await page.locator('.rp-set').all()) {
    await r.locator('input').nth(0).fill('20'); await r.locator('input').nth(1).fill('10'); await r.locator('.rp-tick').click();
  }
  await page.click('#fbtn'); await page.waitForSelector('.fb-card');
  await page.click('[data-nav=home]');
  assert.equal(await page.locator('.rp-banner').count(), 1);
  await page.click('text=Rate now'); await page.waitForSelector('.fb-card');
  await tap('quads', 'Healed early', 0); await tap('sideDelts', 'Healed early', 0);
  await page.click('text=Save Feedback'); await page.waitForSelector('#modal.open');
  await h.closeDone(page);

  const m = await h.doSession(page, 8, { onFeedback: () => tap('quads', 'Healed early', 0) });
  assert.match(m, /Quads \+1 set/);
  assert.match(m, /Side delts \+1 set/);
  assert.doesNotMatch(m, /Back \+/);
  assert.doesNotMatch(m, /Hamstrings \+/);
  await h.closeDone(page);

  const st = await h.state(page);
  assert.equal(st.bonusSets.quads, 1);
  assert.equal(st.bonusSets.sideDelts, 1);
  assert.equal(st.bonusSets.back, 0);
  assert.ok(st.flags['cs-row']);
});

test('week 2 sets reflect bonus sets and the joint-pain flag shows', async () => {
  await page.click('.today-card'); await page.waitForSelector('.ex-card');
  const n = (id) => page.locator('#ec-' + id + ' .rp-set').count();
  assert.equal(await n('leg-press'), 3);
  assert.equal(await n('db-lateral'), 3);
  assert.equal(await n('rdl'), 2);
  assert.match(await page.textContent('#ec-cs-row'), /Joint pain flagged/);
});

test('still sore with reps dropped gives −1', async () => {
  for (const r of await page.locator('.rp-set').all()) { await r.locator('input').nth(1).fill('6'); await r.locator('.rp-tick').click(); }
  await page.click('#fbtn'); await page.waitForSelector('.fb-card');
  await tap('chest', 'Still sore', 0);
  assert.match(await card('chest'), /−1 set/);
  assert.deepEqual(page.errors, []);
});
