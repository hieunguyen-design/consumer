/**
 * ⚠️ OPT-IN ONLY — disabled unless ENABLE_AUTOMATION=true.
 *
 * Driving facebook.com with a headless browser violates Meta's Platform Terms
 * (Automated Data Collection Terms) even on your own account, and commonly
 * triggers checkpoints, temporary locks, or permanent disablement.
 * Enable only on an account you accept losing. This is intentionally a thin
 * reference implementation; FB's DOM changes weekly and selectors will rot.
 */
export async function automationAdapter({ target }) {
  if (process.env.ENABLE_AUTOMATION !== 'true') return null;

  const { chromium } = await import('playwright');
  const storageState = process.env.FB_SESSION_STATE_PATH; // exported from a real login
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState });
  const page = await ctx.newPage();

  try {
    await page.goto(`https://www.facebook.com/${target.fbId}`, {
      waitUntil: 'domcontentloaded',
    });

    if (target.action === 'unfriend') {
      await page
        .getByRole('button', { name: /^Friends$/ })
        .click({ timeout: 15000 });
      await page
        .getByRole('menuitem', { name: /Unfriend/i })
        .click({ timeout: 10000 });
      await page
        .getByRole('button', { name: /^Confirm$/ })
        .click({ timeout: 10000 });
    } else {
      await page
        .getByRole('button', { name: /^Following$/ })
        .click({ timeout: 15000 });
      await page
        .getByRole('menuitem', { name: /^Unfollow/i })
        .click({ timeout: 10000 });
    }

    await page.waitForTimeout(1500);
    return {
      id: target.id,
      status: 'success',
      message: 'Executed by automation worker',
    };
  } catch (e) {
    return {
      id: target.id,
      status: 'failed',
      message: 'Automation failed: ' + e.message,
    };
  } finally {
    await browser.close();
  }
}
