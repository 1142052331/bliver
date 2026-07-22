import { expect, test } from '@playwright/test';

import {
  VISUAL_BASELINE_PROJECT,
  pathForVisualBaseline,
  prepareVisualBaseline,
  settleVisualBaseline,
  visualBaselineLocales,
  visualBaselineStates,
} from './visual-baseline-fixtures.js';

test.describe('390x844 localized visual baselines', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(process.platform !== 'win32', 'canonical visual baselines run on Windows');

  for (const locale of visualBaselineLocales) {
    for (const state of visualBaselineStates) {
      test(`${locale} / ${state}`, async ({ page }, testInfo) => {
        test.skip(
          testInfo.project.name !== VISUAL_BASELINE_PROJECT,
          `visual baselines only run in ${VISUAL_BASELINE_PROJECT}`,
        );
        await prepareVisualBaseline(page, locale, state);
        await page.goto(pathForVisualBaseline(state));
        await settleVisualBaseline(page, locale, state);

        await expect(page).toHaveScreenshot(`${state}--${locale}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
          maxDiffPixels: 300,
          scale: 'css',
          threshold: 0.1,
        });
      });
    }
  }
});
