import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('two same-org users, in different browser timezones with different personal display timezones, see identical chore order and colors', async ({
  browser,
}) => {
  const contextA = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  const contextB = await browser.newContext({ timezoneId: 'America/Los_Angeles' });

  try {
    const pageA = await contextA.newPage();
    await pageA.setExtraHTTPHeaders({
      'Cf-Access-Jwt-Assertion': await signE2eJwt('admin-e2e@example.com'),
    });
    await pageA.goto('/');

    const pageB = await contextB.newPage();
    await pageB.setExtraHTTPHeaders({
      'Cf-Access-Jwt-Assertion': await signE2eJwt('member-e2e@example.com'),
    });
    await pageB.goto('/');

    const barsA = pageA.getByTestId('chore-bar');
    const barsB = pageB.getByTestId('chore-bar');
    await expect(barsA).toHaveCount(2);
    await expect(barsB).toHaveCount(2);

    const namesA = await barsA.locator('.font-medium').allTextContents();
    const namesB = await barsB.locator('.font-medium').allTextContents();
    expect(namesB).toEqual(namesA);

    const colorsA = await barsA
      .locator('[data-testid="progress-bar"]')
      .evaluateAll((els) => els.map((el) => el.className));
    const colorsB = await barsB
      .locator('[data-testid="progress-bar"]')
      .evaluateAll((els) => els.map((el) => el.className));
    expect(colorsB).toEqual(colorsA);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
