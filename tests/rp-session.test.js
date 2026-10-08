// v1 must-haves: first load, Day A layout, autosave, rotation, week advance,
// last-time + suggestion, history, PPL switch, repeat-this-week.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let srv, browser, page;
before(async () => { srv = await h.startServer(); browser = await h.launch(); page = await h.newPage(browser, srv.url); });
after(async () => { await browser.close(); srv.server.close(); });

test('first load shows Block 1 · Week 1 · Day A with RIR 3', async () => {
  const card = await page.textContent('.today-card');
  assert.match(card, /Next: Block 1 · Week 1 · Day A/);
  assert.match(card, /Target RIR 3/);
});

test('Day A has six exercises with two sets, notes, rest and superset pair', async () => {
  await page.click('.today-card');
  await page.waitForSelector('.ex-card');
  assert.equal(await page.locator('.ex-card').count(), 6);
  for (const c of await page.locator('.ex-card').all()) assert.equal(await c.locator('.rp-set').count(), 2);
  const txt = await page.textContent('#app');
  assert.match(txt, /Pick weights you could lift 3 more times\./);
  assert.match(txt, /8–12 reps · RIR 3 · Rest 2:30/);
  assert.match(txt, /Full depth hips allow/);
  assert.match(txt, /Find a weight for 3 RIR/);
  assert.equal(await page.locator('.ss-pair').count(), 1);
});

test('inputs autosave and survive a reload', async () => {
  await page.fill('#rpw-leg-press-0', '100');
  assert.equal(await page.inputValue('#rpw-leg-press-1'), '100', 'weight flows to the next set');
  await page.fill('#rpr-leg-press-0', '12');
  await page.click('#rps-leg-press-0 .rp-tick');
  assert.ok(await page.isVisible('#timer-pill'), 'rest timer starts on tick');
  await page.reload();
  await page.waitForSelector('.today-card');
  assert.match(await page.textContent('.today-card'), /Resume/);
  await page.click('.today-card');
  assert.equal(await page.inputValue('#rpw-leg-press-0'), '100');
  assert.equal(await page.inputValue('#rpr-leg-press-0'), '12');
  assert.equal(await page.locator('#rps-leg-press-0.logged').count(), 1);
});

test('A → B → C rotation, then week 2 at RIR 2', async () => {
  let m = await h.doSession(page, 12);
  assert.match(m, /Next: Block 1 · Week 1 · Day B/);
  await h.closeDone(page);
  m = await h.doSession(page, 12, { skipLast: true });
  assert.match(m, /Day C/);
  await h.closeDone(page);
  m = await h.doSession(page, 12, { before: async () => {
    assert.match(await page.textContent('#app'), /Optional/);
    await page.click('text=Skip exercise');
  } });
  assert.match(m, /week 2 is RIR 2/);
  await h.closeDone(page);
  const card = await page.textContent('.today-card');
  assert.match(card, /Block 1 · Week 2 · Day A/);
  assert.match(card, /Target RIR 2/);
  assert.match(card, /2 sets per exercise/);
});

test('second Day A shows last time and suggests +increment', async () => {
  await page.click('.today-card');
  await page.waitForSelector('.ex-card');
  const lp = await page.textContent('#ec-leg-press');
  assert.match(lp, /100 × 12/);
  assert.match(lp, /105 kg/);
  assert.equal(await page.inputValue('#rpw-leg-press-0'), '105');
  assert.match(await page.textContent('#ec-rdl'), /22\.5 kg/);
  await page.click('.back-btn');
});

test('history lists RP sessions', async () => {
  await page.click('[data-nav=history]');
  await page.waitForSelector('.hist-row');
  assert.equal(await page.locator('.hist-row').count(), 3);
});

test('PPL can be switched on and back without losing RP state', async () => {
  await page.click('[data-nav=manage]');
  await page.click('text=PPL split');
  await page.click('[data-nav=home]');
  assert.match(await page.textContent('#app'), /TRAIN/);
  await page.click('[data-nav=manage]');
  await page.click('text=RP Recomp');
  await page.click('[data-nav=home]');
  assert.match(await page.textContent('.today-card'), /Week 2 · Day A/);
});

test('after a 10+ day gap, "Repeat this week" goes back to Day A of that week', async () => {
  await page.click('.today-card');
  await page.click('text=Discard');
  await page.waitForSelector('.today-card');
  await page.evaluate(() => { const s = JSON.parse(localStorage.cleanslate_rp_state); s.lastSessionDate = '2020-01-01'; localStorage.cleanslate_rp_state = JSON.stringify(s); });
  await page.reload();
  await page.waitForSelector('.rp-banner');
  await page.click('text=Repeat this week');
  assert.match(await page.textContent('.today-card'), /Week 1 · Day A/);
  assert.deepEqual(page.errors, []);
});
