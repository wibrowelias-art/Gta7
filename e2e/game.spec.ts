import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __neonhq: any;
  }
}

const errors: string[] = [];

async function boot(page: Page, name = 'Sunset Labs'): Promise<void> {
  page.on('console', (m) => {
    // Headless SwiftShader emits GL driver performance notes that are not app warnings.
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver Message')) errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/hq.html');
  await page.getByPlaceholder('Your company name').fill(name);
  await page.getByRole('button', { name: 'Open the doors' }).click();
  await page.waitForFunction(() => !!window.__neonhq?.scene, null, { timeout: 60_000 });
}

/** Dismiss any blocking modal (milestone card, daily report, event) so the next action can proceed. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(120); // let the sim surface any milestone/report/event first
  for (let i = 0; i < 6; i++) {
    const card = page.locator('.title-card');
    if (await card.count()) {
      await card.getByRole('button').click();
      continue;
    }
    const modalBtn = page.locator('#modals .modal .btn').first();
    if (await modalBtn.count()) {
      await modalBtn.click();
      await page.waitForTimeout(150);
      continue;
    }
    return;
  }
}

test.describe('NEON HQ', () => {
  test.beforeEach(() => {
    errors.length = 0;
  });

  test('full run: name, bonus, chat, meeting, build, and the save survives a reload', async ({ page }) => {
    await boot(page, 'Sunset Labs');
    await expect(page.locator('.hud-cash .amount')).toHaveText(/\$\d/);

    // Pay a bonus from the worker card.
    await settle(page);
    await page.locator('[data-panel="team"]').click();
    await page.locator('[data-worker]').first().click();
    const spentBefore = await page.evaluate(() => window.__neonhq.state.stats.spentTotal);
    await page.locator('[data-tut="bonus"]').click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.stats.bonusesPaid)).toBe(1);
    expect(await page.evaluate(() => window.__neonhq.state.stats.spentTotal)).toBe(spentBefore + 50);
    await page.keyboard.press('Escape');

    // Chat with a worker and get a reply.
    await settle(page);
    await page.locator('[data-panel="chat"]').click();
    await page.locator('[data-chat]').first().click();
    await page.getByPlaceholder(/Message/).fill('What are you working on?');
    await page.keyboard.press('Enter');
    await expect(page.locator('.bubble.you')).toHaveCount(1);
    await expect(page.locator('.bubble.worker:not(.typing)').last()).toBeVisible({ timeout: 10_000 });
    const bubbles = await page.locator('.bubble.worker:not(.typing)').count();
    expect(bubbles).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Escape');

    // Call a meeting from the Command room.
    await settle(page);
    await page.evaluate(() => {
      const a = window.__neonhq;
      a.openPanel('room', { roomId: a.state.rooms.find((r: any) => r.type === 'command').id });
    });
    await page.locator('[data-focus="spirit"]').click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.focus)).toBe('spirit');

    // Build a Chill Bar on floor 2 (grant cash so the test is deterministic).
    await settle(page);
    await page.evaluate(() => {
      window.__neonhq.state.cash += 10_000;
    });
    await settle(page); // the cash grant triggers the $10k milestone card
    await page.locator('[data-panel="build"]').click();
    await page.locator('[data-tut="floor"]').click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.floors)).toBe(2);
    await page.locator('[data-slot="1-0"]').click();
    await page.locator('[data-tut="build-bar"]').click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.rooms.some((r: any) => r.type === 'bar'))).toBe(true);
    await page.keyboard.press('Escape');

    // Persist and reload.
    await page.evaluate(() => window.__neonhq.save());
    const snapshot = await page.evaluate(() => ({ company: window.__neonhq.state.company, rooms: window.__neonhq.state.rooms.length, floors: window.__neonhq.state.floors, bonuses: window.__neonhq.state.stats.bonusesPaid }));
    await page.reload();
    await page.waitForFunction(() => !!window.__neonhq);
    const after = await page.evaluate(() => ({ company: window.__neonhq.state.company, rooms: window.__neonhq.state.rooms.length, floors: window.__neonhq.state.floors, bonuses: window.__neonhq.state.stats.bonusesPaid }));
    expect(after).toEqual(snapshot);
    await expect(page.getByPlaceholder('Your company name')).toHaveCount(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('settings: exactly one fiction disclaimer, quality switch, no forbidden words in the UI', async ({ page }) => {
    await boot(page);
    await settle(page);
    await page.locator('[data-panel="settings"]').click();
    await expect(page.getByText('NEON HQ is a game. All money and workers are fictional.')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Battery' }).click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.settings.quality)).toBe('battery');
    await page.keyboard.press('Escape');
    for (const panel of ['team', 'build', 'chat', 'settings']) {
      await settle(page);
      await page.locator(`[data-panel="${panel}"]`).click();
      await expect(page.locator(`section.panel[data-panel="${panel}"]`)).toBeVisible();
      const text = (await page.locator('#panels').innerText()).toLowerCase();
      for (const bad of ['todo', 'placeholder', 'coming soon', 'lorem', 'mock', 'simulat', 'dummy', 'fake', 'tbd', 'wip', 'demo', 'test']) {
        expect(text, `${panel} contains "${bad}"`).not.toContain(bad);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('tutorial is skippable and the game keeps running', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect.poll(() => page.evaluate(() => window.__neonhq.state.tutorialStep)).toBe(4);
    const c1 = await page.evaluate(() => window.__neonhq.state.clock);
    await page.waitForTimeout(1200);
    const c2 = await page.evaluate(() => window.__neonhq.state.clock);
    expect(c2).toBeGreaterThan(c1);
  });
});

for (const vp of [
  { w: 360, h: 780 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 1440, h: 900 },
]) {
  test(`layout ${vp.w}x${vp.h}: HUD does not overlap, touch targets ≥ 44px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await boot(page);
    await page.getByRole('button', { name: 'Skip' }).click();
    const rects = await page.evaluate(() =>
      ['.hud-top-left', '.hud-cash', '.hud-dock', '.hud-radar'].map((sel) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { sel, x: r.left, y: r.top, w: r.width, h: r.height };
      }),
    );
    const overlaps = (a: any, b: any) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j]), `${rects[i].sel} overlaps ${rects[j].sel}`).toBe(false);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(vp.w + 0.5);
      expect(r.y + r.h).toBeLessThanOrEqual(vp.h + 0.5);
    }
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#hud button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.getAttribute('aria-label') ?? b.textContent, w: r.width, h: r.height };
      }).filter((b) => b.w < 44 || b.h < 44),
    );
    expect(small, JSON.stringify(small)).toEqual([]);
    // Workers are at least 40px tall on a phone at the default zoom.
    if (vp.w < 700) {
      // The establishing shot flies in from a wide view; wait for it to settle.
      await expect.poll(() => page.evaluate(() => window.__neonhq.scene.cameraFocus().zoom * 92), { timeout: 20_000 }).toBeGreaterThanOrEqual(40);
    }
  });
}
