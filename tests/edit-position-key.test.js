// v9: edit/delete past sessions (synced), set position by hand, sync key.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let srv, browser, page, worker;
before(async () => { srv = await h.startServer(); browser = await h.launch(); worker = h.fakeWorker(); page = await h.newPage(browser, srv.url, worker); });
after(async () => { await browser.close(); srv.server.close(); });

test('no sync key header is sent until one is saved', async () => {
  assert.ok(worker.requests.length > 0);
  assert.ok(worker.requests.every((r) => !r.headers['x-sync-key']));
});

test('editing a past session updates suggestions and patches Airtable', async () => {
  await h.doSession(page, 12, { weight: 100 });
  await h.closeDone(page);
  await page.waitForTimeout(300);
  assert.equal(worker.store.length, 1);

  await page.click('[data-nav=history]'); await page.waitForSelector('.hist-row');
  await page.click('.hist-head');
  await page.click('text=Edit or delete session');
  await page.waitForSelector('.ex-card');
  const reps = page.locator('.ex-card').first().locator('.rp-set').first().locator('input').nth(1);
  await reps.fill('8');
  await page.click('text=Save Changes');
  await page.waitForSelector('.hist-row');
  await page.click('.hist-head');
  assert.match(await page.textContent('.hist-body'), /100×8/);
  await page.waitForTimeout(500);
  assert.ok(worker.requests.some((r) => r.method === 'PATCH' && r.path === '/sessions'), 'PATCH sent');
  const remote = JSON.parse(worker.store[0].fields.Log).rp;
  assert.equal(remote.rev, 1);
  assert.equal(remote.sets[0].reps, 8);
});

test('set position by hand, and suggestions use the edited reps', async () => {
  await page.click('[data-nav=manage]');
  await page.selectOption('#pos-day', 'A');
  await page.click('text=Set position');
  await page.click('[data-nav=home]');
  assert.match(await page.textContent('.today-card'), /Block 1 · Week 1 · Day A/);
  await page.click('.today-card'); await page.waitForSelector('.ex-card');
  const lp = await page.textContent('#ec-leg-press');
  assert.match(lp, /100 × 8/);
  assert.match(lp, /Same weight – aim for \+1 rep/);
  assert.equal(await page.inputValue('#rpw-leg-press-0'), '100');
  await page.click('text=Discard');
});

test('deleting a session removes it locally and from Airtable, and it stays gone', async () => {
  await page.click('[data-nav=history]'); await page.waitForSelector('.hist-row');
  await page.click('.hist-head');
  await page.click('text=Edit or delete session');
  await page.click('text=Delete this session');
  await page.waitForTimeout(500);
  assert.equal((await h.logs(page)).length, 0);
  assert.equal(worker.store.length, 0);
  await page.reload(); await page.waitForSelector('.today-card'); await page.waitForTimeout(500);
  assert.equal((await h.logs(page)).length, 0, 'not restored from Airtable');
});

test('a saved sync key is sent with every request; a refusal is shown in Manage', async () => {
  await page.click('[data-nav=manage]');
  await page.fill('#sync-key', 'test-key-123');
  const before = worker.requests.length;
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(500);
  const after = worker.requests.slice(before);
  assert.ok(after.length > 0);
  assert.ok(after.every((r) => r.headers['x-sync-key'] === 'test-key-123'));

  worker.status = 401;
  await page.click('text=Refresh from Airtable');
  await page.waitForTimeout(500);
  assert.match(await page.textContent('#app'), /Airtable refused the request/);
  assert.deepEqual(page.errors, []);
});
