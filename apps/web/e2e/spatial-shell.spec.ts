import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
} from './accessibility.js';
import { installJourneyApi } from './journey-api.js';

const locales = [
  {
    locale: 'zh-CN',
    map: '地图',
    publish: '留下足迹',
    notifications: '通知',
  },
  {
    locale: 'en',
    map: 'Map',
    publish: 'Leave footprint',
    notifications: 'Notifications',
  },
  {
    locale: 'ja',
    map: '地図',
    publish: '足跡を残す',
    notifications: '通知',
  },
] as const;

function shellControls(page: Page): Locator {
  return page.locator(
    [
      '.app-shell__header a:visible',
      '.app-shell__header button:visible',
      '.app-shell__header select:visible',
      '.app-shell__header input:visible',
      '.app-shell__nav a:visible',
      '.app-shell__nav button:visible',
    ].join(', '),
  );
}

async function expectMinimumTouchTargets(controls: Locator): Promise<void> {
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(8);

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const label =
      (await control.getAttribute('aria-label')) ??
      (await control.textContent())?.trim() ??
      `shell control ${index + 1}`;
    const box = await control.boundingBox();

    expect(box, `${label} must have a visible bounding box`).not.toBeNull();
    expect(box?.width ?? 0, `${label} must be at least 44px wide`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${label} must be at least 44px high`).toBeGreaterThanOrEqual(44);
  }
}

async function expectJapaneseShellDoesNotOverlap(page: Page): Promise<void> {
  const issues = await shellControls(page).evaluateAll((elements) => {
    const visible = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const overflowIsClipped = ['hidden', 'clip'].includes(style.overflowX);
      return {
        label:
          element.getAttribute('aria-label') ??
          element.textContent?.trim() ??
          element.tagName.toLowerCase(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        contentFitsHorizontally:
          element.scrollWidth <= element.clientWidth + 1 || overflowIsClipped,
        contentFitsVertically:
          element.scrollHeight <= element.clientHeight + 1 ||
          ['hidden', 'clip'].includes(style.overflowY),
      };
    });

    const failures: string[] = visible.flatMap((control) => [
      ...(control.contentFitsHorizontally
        ? []
        : [`${control.label} has unclipped horizontal content`]),
      ...(control.contentFitsVertically
        ? []
        : [`${control.label} has unclipped vertical content`]),
    ]);

    for (let leftIndex = 0; leftIndex < visible.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visible.length; rightIndex += 1) {
        const left = visible[leftIndex]!;
        const right = visible[rightIndex]!;
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (overlapWidth > 0.5 && overlapHeight > 0.5) {
          failures.push(`${left.label} overlaps ${right.label}`);
        }
      }
    }

    return failures;
  });

  expect(issues, issues.join('\n')).toEqual([]);
}

async function expectReducedShellMotion(page: Page): Promise<void> {
  const durations = await page
    .locator(
      [
        '.app-shell__header',
        '.app-shell__header *',
        '.app-shell__nav',
        '.app-shell__nav *',
      ].join(', '),
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        getComputedStyle(element)
          .transitionDuration.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) =>
            value.endsWith('ms')
              ? Number.parseFloat(value)
              : Number.parseFloat(value) * 1_000,
          ),
      ),
    );

  expect(Math.max(0, ...durations)).toBeLessThanOrEqual(0.01);
}

test('spatial shell is complete across all supported locales', async ({ context, page }, testInfo) => {
  test.setTimeout(90_000);

  for (const [index, sample] of locales.entries()) {
    const localePage = index === 0 ? page : await context.newPage();

    try {
      await localePage.addInitScript(
        ({ locale }) => localStorage.setItem('bliver.locale', locale),
        { locale: sample.locale },
      );
      if (sample.locale === 'en') {
        await localePage.emulateMedia({ reducedMotion: 'reduce' });
      }
      await installJourneyApi(localePage, 'userA');
      await localePage.goto('/map');

      await expect(localePage.locator('html')).toHaveAttribute('lang', sample.locale);
      expect(
        await localePage.evaluate(() => localStorage.getItem('bliver.locale')),
      ).toBe(sample.locale);

      const nav = localePage.locator('.app-shell__nav');
      await expect(nav).toBeVisible();
      await expect(nav.locator('.app-shell__nav-link')).toHaveCount(4);

      const mapLink = nav.getByRole('link', { name: sample.map, exact: true });
      await expect(mapLink).toBeVisible();
      await expect(mapLink).toHaveAttribute('aria-current', 'page');
      await expect(mapLink).toHaveClass(/\bis-active\b/);

      const header = localePage.locator('.app-shell__header');
      const notifications = header.getByRole('link', {
        name: sample.notifications,
        exact: true,
      });
      await expect(notifications).toBeVisible();
      await expect(notifications).toHaveAttribute('href', '/notifications');

      const publish = header.getByRole('button', {
        name: sample.publish,
        exact: true,
      });
      await expect(publish).toBeVisible();
      await expect(publish).toHaveClass(/\bbliver-button--publish\b/);
      await expect(publish).toHaveCSS('background-color', 'rgb(197, 75, 54)');

      await expectMinimumTouchTargets(shellControls(localePage));
      await expectNoHorizontalOverflow(localePage);
      await expectNoAxeViolations(localePage);

      if (sample.locale === 'ja' && testInfo.project.name === 'mobile-360x800') {
        await expectJapaneseShellDoesNotOverlap(localePage);
      }
      if (sample.locale === 'en') {
        await expectReducedShellMotion(localePage);
      }
    } finally {
      if (localePage !== page) await localePage.close();
    }
  }
});
