import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __neoncity: { advance(s: number): void; start(): void; state(): any };
  }
}

test('NEON CITY: boots clean, walk to the car, drive, and a job starts', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver')) errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/?q=battery');
  await page.waitForSelector('#play:not(.hidden)', { timeout: 120_000 });
  await page.click('#play');
  await page.waitForFunction(() => !!window.__neoncity?.advance);
  // Walk forward (player faces the car) and get in.
  await page.keyboard.down('w');
  await page.evaluate(() => window.__neoncity.advance(2.2));
  await page.keyboard.up('w');
  await page.keyboard.press('e');
  await page.evaluate(() => window.__neoncity.advance(0.2));
  let s = await page.evaluate(() => window.__neoncity.state());
  expect(s.inCar, `player should be in the car, pos=${s.pos} car=${s.carPos}`).toBe(true);
  // Drive.
  await page.keyboard.down('w');
  await page.evaluate(() => window.__neoncity.advance(3));
  s = await page.evaluate(() => window.__neoncity.state());
  expect(s.kmh).toBeGreaterThan(30);
  await page.keyboard.up('w');
  // A job starts a few seconds after getting in.
  await page.evaluate(() => window.__neoncity.advance(5));
  s = await page.evaluate(() => window.__neoncity.state());
  expect(s.mission).not.toBeNull();
  await expect(page.locator('.c-mission')).toBeVisible();
  // Finishing a job pays out and the CASH HUD updates.
  await page.keyboard.up('w');
  await page.evaluate(() => {
    const a = window.__neoncity as any;
    let target = a.missionTarget();
    for (let i = 0; i < 4 && target; i++) {
      a.teleportCar(target.x, target.z);
      a.advance(0.5);
      target = a.missionTarget();
    }
  });
  s = await page.evaluate(() => window.__neoncity.state());
  expect(s.cash).toBeGreaterThan(0);
  await expect(page.locator('.c-cash-v')).not.toHaveText('$0');
  // Parkour: climb a shipping container in the industrial district.
  await page.keyboard.press('e');
  await page.evaluate(() => { const a = window.__neoncity as any; a.advance(0.5); a.teleport(-285.2, 174, 0); a.setCam(Math.PI / 2); a.advance(0.2); });
  await page.keyboard.down('w');
  await page.evaluate(() => (window.__neoncity as any).advance(0.3));
  await page.keyboard.down(' ');
  await page.evaluate(() => (window.__neoncity as any).advance(0.1));
  await page.keyboard.up(' ');
  await page.evaluate(() => (window.__neoncity as any).advance(1.5));
  await page.keyboard.up('w');
  s = await page.evaluate(() => (window.__neoncity as any).state());
  expect(s.y, 'should have climbed onto the container').toBeGreaterThan(2);
  // Grab a bike (not a theft), then surf the train and stand on the rooftop.
  await page.evaluate(() => { const a = window.__neoncity as any; const b = a.bikePos(); a.teleport(b.x + 0.5, b.z + 1.2); a.advance(0.3); });
  await page.keyboard.press('e');
  await page.evaluate(() => window.__neoncity.advance(0.3));
  let st = await page.evaluate(() => (window.__neoncity as any).state());
  expect(st.kind).toBe('bike');
  expect(st.wanted).toBe(0);
  await page.keyboard.press('e');
  await page.evaluate(() => { const a = window.__neoncity as any; a.advance(0.5); const p = a.trainPos(); a.teleport(p.x + 20, p.z, 13.7); a.advance(2); });
  st = await page.evaluate(() => (window.__neoncity as any).state());
  expect(st.onTrain).toBe(true);
  await page.evaluate(() => { const a = window.__neoncity as any; const r = a.rooftop(); a.teleport(r.x, r.z + 2, r.y); a.advance(1.5); });
  st = await page.evaluate(() => (window.__neoncity as any).state());
  expect(st.y).toBeGreaterThan(10);
  expect(errors, errors.join('\n')).toEqual([]);
});
