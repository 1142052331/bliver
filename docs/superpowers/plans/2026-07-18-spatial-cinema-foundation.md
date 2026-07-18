# Spatial Cinema Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Natural City design primitives, Simplified Chinese/English/Japanese runtime, responsive four-destination shell, and global state surfaces that every later Spatial Cinema OS milestone will use.

**Architecture:** Keep `@bliver/ui` business-free and place locale/runtime ownership in `apps/web`. The shell consumes shared primitives and translation keys, while feature routes remain independently owned. This milestone does not change the map engine, feature APIs, or backend contracts.

**Tech Stack:** React 19, TypeScript 6, React Router 7, i18next, react-i18next, Lucide React, CSS custom properties, Vitest, Testing Library, Playwright.

---

## File Map

Create:

- `apps/web/src/i18n/locale.ts`: locale matching, initial resolution, and persistence.
- `apps/web/src/i18n/resources.ts`: typed resources for `zh-CN`, `en`, and `ja`.
- `apps/web/src/i18n/i18n.ts`: configured i18next instance factory and singleton.
- `apps/web/src/i18n/I18nProvider.tsx`: React provider boundary.
- `apps/web/src/i18n/__tests__/locale.test.ts`: locale behavior.
- `apps/web/src/i18n/__tests__/resources.test.ts`: resource parity.
- `apps/web/src/i18n/__tests__/I18nProvider.test.tsx`: runtime language changes.
- `packages/ui/src/IconButton.tsx`: accessible icon-only command.
- `packages/ui/src/SegmentedControl.tsx`: single-choice product mode control.
- `packages/ui/src/Sheet.tsx`: semantic dialog-based sheet.
- `packages/ui/src/StatusView.tsx`: reusable loading/empty/error content frame.
- `packages/ui/src/Skeleton.tsx`: nonblocking structured loading primitive.
- `apps/web/src/app/LocaleSwitcher.tsx`: persisted language selector.
- `apps/web/src/app/app-shell.css`: responsive mobile/tablet/desktop shell.
- `apps/web/src/app/__tests__/AppShell.test.tsx`: shell semantics and locale behavior.
- `apps/web/src/app/__tests__/ErrorBoundary.test.tsx`: translated fatal fallback.
- `apps/web/e2e/spatial-shell.spec.ts`: six-viewport and three-locale shell checks.
- `docs/qa/v2-spatial-cinema-m1-foundation.md`: milestone evidence.

Modify:

- `apps/web/package.json`: add direct i18n and icon dependencies.
- `package-lock.json`: lock dependency graph.
- `packages/ui/src/Button.tsx`: add the dedicated coral publish variant.
- `packages/ui/src/index.ts`: export the new primitives.
- `packages/ui/src/tokens.css`: complete Natural City tokens and component states.
- `packages/ui/src/__tests__/primitives.test.tsx`: primitive contracts.
- `apps/web/src/main.tsx`: mount the locale provider.
- `apps/web/src/app/AppShell.tsx`: four destinations, header tools, publish command.
- `apps/web/src/app/ErrorBoundary.tsx`: translated accessible fallback.
- `apps/web/src/app/guards/RequireAuth.tsx`: translated loading state.
- `apps/web/src/app/router.tsx`: translated not-found and expired-session states.
- `apps/web/src/app/__tests__/router.test.tsx`: translated route contracts.
- `playwright.config.ts`: add tablet and wide-screen projects.

Do not modify map, API, database, Socket.IO, visibility, or authorization code in
this plan.

### Task 1: Add Locale Resolution and Persistence

**Files:**

- Create: `apps/web/src/i18n/locale.ts`
- Create: `apps/web/src/i18n/__tests__/locale.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing locale tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  LOCALE_STORAGE_KEY,
  matchSupportedLocale,
  persistLocale,
  resolveInitialLocale,
} from '../locale.js';

describe('Bliver locale resolution', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-Hans-JP', 'zh-CN'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['fr-FR', null],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(matchSupportedLocale(input)).toBe(expected);
  });

  it('prefers a persisted supported locale over browser languages', () => {
    expect(resolveInitialLocale({ stored: 'ja', languages: ['zh-CN'] })).toBe('ja');
  });

  it('uses the first supported browser language and falls back to English', () => {
    expect(resolveInitialLocale({ stored: null, languages: ['fr-FR', 'zh-Hans'] })).toBe('zh-CN');
    expect(resolveInitialLocale({ stored: null, languages: ['fr-FR'] })).toBe('en');
  });

  it('persists an explicit locale under the canonical key', () => {
    const writes: Array<[string, string]> = [];
    persistLocale({ setItem: (key, value) => writes.push([key, value]) }, 'ja');
    expect(writes).toEqual([[LOCALE_STORAGE_KEY, 'ja']]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n/__tests__/locale.test.ts
```

Expected: FAIL because `../locale.js` does not exist.

- [ ] **Step 3: Install direct Web dependencies**

Run:

```powershell
npm.cmd install --workspace @bliver/web i18next react-i18next lucide-react
```

Expected: `apps/web/package.json` and the root `package-lock.json` record the
three direct dependencies without audit errors blocking installation.

- [ ] **Step 4: Implement the locale module**

```ts
export const supportedLocales = ['zh-CN', 'en', 'ja'] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const LOCALE_STORAGE_KEY = 'bliver.locale';

export function matchSupportedLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

export function resolveInitialLocale(input: {
  readonly stored: string | null;
  readonly languages: readonly string[];
}): AppLocale {
  const stored = matchSupportedLocale(input.stored);
  if (stored) return stored;
  for (const language of input.languages) {
    const match = matchSupportedLocale(language);
    if (match) return match;
  }
  return 'en';
}

export function persistLocale(
  storage: Pick<Storage, 'setItem'>,
  locale: AppLocale,
): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function detectInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';
  return resolveInitialLocale({
    stored: window.localStorage.getItem(LOCALE_STORAGE_KEY),
    languages: window.navigator.languages,
  });
}
```

- [ ] **Step 5: Run the locale tests**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n/__tests__/locale.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit locale resolution**

```powershell
git add apps/web/package.json package-lock.json apps/web/src/i18n/locale.ts apps/web/src/i18n/__tests__/locale.test.ts
git commit -m "feat: add persisted locale resolution"
```

### Task 2: Add Complete Foundation Translation Resources

**Files:**

- Create: `apps/web/src/i18n/resources.ts`
- Create: `apps/web/src/i18n/__tests__/resources.test.ts`

- [ ] **Step 1: Write the failing resource-parity test**

```ts
import { describe, expect, it } from 'vitest';

import { resources } from '../resources.js';

function keys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('foundation translation resources', () => {
  it('has the same nonempty keys in every locale', () => {
    const english = keys(resources.en.translation);
    expect(keys(resources['zh-CN'].translation)).toEqual(english);
    expect(keys(resources.ja.translation)).toEqual(english);
    for (const locale of Object.values(resources)) {
      for (const value of Object.values(locale.translation).flatMap((group) => Object.values(group))) {
        expect(String(value).trim()).not.toBe('');
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n/__tests__/resources.test.ts
```

Expected: FAIL because `../resources.js` does not exist.

- [ ] **Step 3: Implement typed resources**

```ts
interface FoundationTranslation {
  readonly common: { readonly brand: string; readonly notifications: string; readonly language: string; readonly retry: string; readonly close: string; readonly loading: string };
  readonly nav: { readonly map: string; readonly activity: string; readonly messages: string; readonly me: string };
  readonly actions: { readonly publish: string };
  readonly locale: { readonly zhCN: string; readonly en: string; readonly ja: string };
  readonly session: { readonly loading: string; readonly expiredTitle: string; readonly expiredBody: string; readonly signIn: string };
  readonly errors: { readonly unexpectedTitle: string; readonly unexpectedBody: string; readonly notFoundTitle: string; readonly notFoundBody: string };
}

const en: FoundationTranslation = {
  common: {
    brand: 'Bliver', notifications: 'Notifications', language: 'Language',
    retry: 'Try again', close: 'Close', loading: 'Loading',
  },
  nav: { map: 'Map', activity: 'Activity', messages: 'Messages', me: 'My space' },
  actions: { publish: 'Leave footprint' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: 'Loading session', expiredTitle: 'Session expired',
    expiredBody: 'Sign in again to continue.', signIn: 'Continue to sign in',
  },
  errors: {
    unexpectedTitle: 'Something went wrong',
    unexpectedBody: 'Reload the app and try again.',
    notFoundTitle: 'Page not found', notFoundBody: 'Return to the map to continue.',
  },
};

const zhCN: FoundationTranslation = {
  common: {
    brand: 'Bliver', notifications: '通知', language: '语言',
    retry: '重试', close: '关闭', loading: '加载中',
  },
  nav: { map: '地图', activity: '动态', messages: '消息', me: '我的' },
  actions: { publish: '留下足迹' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: '正在确认登录状态', expiredTitle: '登录已过期',
    expiredBody: '请重新登录后继续。', signIn: '前往登录',
  },
  errors: {
    unexpectedTitle: '应用暂时无法继续',
    unexpectedBody: '请重新加载后再试。',
    notFoundTitle: '找不到这个页面', notFoundBody: '返回地图继续浏览。',
  },
};

const ja: FoundationTranslation = {
  common: {
    brand: 'Bliver', notifications: '通知', language: '言語',
    retry: 'もう一度試す', close: '閉じる', loading: '読み込み中',
  },
  nav: { map: '地図', activity: 'アクティビティ', messages: 'メッセージ', me: 'マイページ' },
  actions: { publish: '足跡を残す' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: 'ログイン状態を確認中', expiredTitle: 'セッションの有効期限が切れました',
    expiredBody: '続けるには、もう一度サインインしてください。', signIn: 'サインインへ進む',
  },
  errors: {
    unexpectedTitle: 'アプリを続行できません',
    unexpectedBody: '再読み込みして、もう一度お試しください。',
    notFoundTitle: 'ページが見つかりません', notFoundBody: '地図に戻って続けてください。',
  },
};

export const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  ja: { translation: ja },
} as const;
```

- [ ] **Step 4: Run the resource test**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n/__tests__/resources.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit resources**

```powershell
git add apps/web/src/i18n/resources.ts apps/web/src/i18n/__tests__/resources.test.ts
git commit -m "feat: add foundation translations"
```

### Task 3: Mount the I18n Runtime

**Files:**

- Create: `apps/web/src/i18n/i18n.ts`
- Create: `apps/web/src/i18n/I18nProvider.tsx`
- Create: `apps/web/src/i18n/__tests__/I18nProvider.test.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Write the failing provider test**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BliverI18nProvider } from '../I18nProvider.js';
import { createBliverI18n } from '../i18n.js';

function Probe() {
  const { t } = useTranslation();
  return <p>{t('actions.publish')}</p>;
}

describe('BliverI18nProvider', () => {
  it('renders and changes a supported locale synchronously', async () => {
    const instance = createBliverI18n('en');
    render(<BliverI18nProvider instance={instance}><Probe /></BliverI18nProvider>);
    expect(screen.getByText('Leave footprint')).toBeVisible();
    await instance.changeLanguage('ja');
    expect(await screen.findByText('足跡を残す')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n/__tests__/I18nProvider.test.tsx
```

Expected: FAIL because the provider and instance factory do not exist.

- [ ] **Step 3: Implement the i18n instance**

```ts
import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { detectInitialLocale, type AppLocale } from './locale.js';
import { resources } from './resources.js';

export function createBliverI18n(locale: AppLocale): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: ['zh-CN', 'en', 'ja'],
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return instance;
}

export const bliverI18n = createBliverI18n(detectInitialLocale());
```

- [ ] **Step 4: Implement the provider and document language sync**

```tsx
import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n } from 'i18next';

import { bliverI18n } from './i18n.js';

export function BliverI18nProvider({
  children,
  instance = bliverI18n,
}: {
  readonly children: ReactNode;
  readonly instance?: i18n;
}) {
  useEffect(() => {
    const sync = (language: string): void => {
      document.documentElement.lang = language;
    };
    sync(instance.resolvedLanguage ?? instance.language);
    instance.on('languageChanged', sync);
    return () => {
      instance.off('languageChanged', sync);
    };
  }, [instance]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
```

- [ ] **Step 5: Mount the provider at the application root**

Replace the root render body in `apps/web/src/main.tsx` with:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <BliverI18nProvider>
      <AppErrorBoundary>
        <AppRouter />
      </AppErrorBoundary>
    </BliverI18nProvider>
  </StrictMode>,
);
```

Add:

```ts
import { BliverI18nProvider } from './i18n/I18nProvider.js';
```

- [ ] **Step 6: Run the provider and locale tests**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/i18n
```

Expected: all i18n test files PASS.

- [ ] **Step 7: Commit the runtime**

```powershell
git add apps/web/src/i18n apps/web/src/main.tsx
git commit -m "feat: mount trilingual runtime"
```

### Task 4: Complete the Natural City Primitive Set

**Files:**

- Create: `packages/ui/src/IconButton.tsx`
- Create: `packages/ui/src/SegmentedControl.tsx`
- Create: `packages/ui/src/Sheet.tsx`
- Create: `packages/ui/src/StatusView.tsx`
- Create: `packages/ui/src/Skeleton.tsx`
- Modify: `packages/ui/src/Button.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/__tests__/primitives.test.tsx`

- [ ] **Step 1: Add failing primitive contracts**

Append tests that assert:

```tsx
render(<IconButton label="Notifications"><span aria-hidden>!</span></IconButton>);
expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('title', 'Notifications');

render(<SegmentedControl label="Map mode" value="now" options={[{ value: 'now', label: 'Now' }, { value: 'friends', label: 'Friends' }]} onChange={() => undefined} />);
expect(screen.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-pressed', 'true');

render(<Sheet open label="Filters" onClose={() => undefined}><p>Content</p></Sheet>);
expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveAttribute('aria-modal', 'true');

render(<StatusView title="No moments" body="Move the map to another area." />);
expect(screen.getByRole('heading', { name: 'No moments' })).toBeVisible();

render(<Skeleton label="Loading activity" lines={3} />);
expect(screen.getByRole('status', { name: 'Loading activity' })).toBeVisible();
```

Also assert `Button variant="publish"` renders class
`bliver-button--publish`.

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```powershell
npm.cmd test --workspace @bliver/ui
```

Expected: FAIL because the new exports and publish variant do not exist.

- [ ] **Step 3: Implement the primitives**

Use native elements and these public contracts:

```tsx
// IconButton.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, children, type = 'button', ...props },
  ref,
) {
  return <button {...props} ref={ref} type={type} aria-label={label} title={label} className={['bliver-icon-button', className].filter(Boolean).join(' ')}>{children}</button>;
});
```

```tsx
// SegmentedControl.tsx
export interface SegmentOption { readonly value: string; readonly label: string; }
export function SegmentedControl({ label, value, options, onChange }: { readonly label: string; readonly value: string; readonly options: readonly SegmentOption[]; readonly onChange: (value: string) => void }) {
  return <div className="bliver-segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
```

```tsx
// Sheet.tsx
import { useEffect, useRef, type ReactNode } from 'react';
export function Sheet({ open, label, onClose, children }: { readonly open: boolean; readonly label: string; readonly onClose: () => void; readonly children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className="bliver-sheet" aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>{children}</dialog>;
}
```

```tsx
// StatusView.tsx and Skeleton.tsx
import type { ReactNode } from 'react';
export function StatusView({ title, body, action }: { readonly title: string; readonly body: string; readonly action?: ReactNode }) { return <section className="bliver-status"><h1>{title}</h1><p>{body}</p>{action}</section>; }
export function Skeleton({ label, lines = 1 }: { readonly label: string; readonly lines?: number }) { return <div className="bliver-skeleton" role="status" aria-label={label}>{Array.from({ length: lines }, (_, index) => <span key={index} aria-hidden />)}</div>; }
```

Add `publish` to `ButtonProps['variant']`, export every component/type from
`packages/ui/src/index.ts`, and keep each file business-free.

- [ ] **Step 4: Extend tokens and interaction states**

Add tokens for sage surfaces, surface white, spacing, safe areas, semantic
z-index, control heights, and exponential easing. Add default/hover/focus/
active/disabled/loading styles for buttons, icon buttons, segmented controls,
sheets, status views, and skeletons. The required publish style is:

```css
.bliver-button--publish {
  background: var(--bliver-color-coral);
  color: #fff;
  box-shadow: 0 10px 24px rgb(197 75 54 / 24%);
}

.bliver-button--publish:hover:not(:disabled) {
  background: var(--bliver-color-coral-active);
}
```

Do not add gradient text, decorative blur, nested-card selectors, or radius
values greater than 8px except full circles/pills and the future Chrono Lens.

- [ ] **Step 5: Run UI tests, typecheck, and lint**

```powershell
npm.cmd test --workspace @bliver/ui
npm.cmd run typecheck --workspace @bliver/ui
npm.cmd run lint --workspace @bliver/ui
```

Expected: all three commands exit 0 with zero lint warnings.

- [ ] **Step 6: Commit primitives**

```powershell
git add packages/ui/src
git commit -m "feat: complete natural city primitives"
```

### Task 5: Build the Responsive Trilingual App Shell

**Files:**

- Create: `apps/web/src/app/LocaleSwitcher.tsx`
- Create: `apps/web/src/app/app-shell.css`
- Create: `apps/web/src/app/__tests__/AppShell.test.tsx`
- Modify: `apps/web/src/app/AppShell.tsx`

- [ ] **Step 1: Write failing shell tests**

Render `AppShell` under a memory router and the test i18n provider. Assert:

```tsx
expect(screen.getAllByRole('navigation')).toHaveLength(1);
expect(screen.getAllByRole('link').filter((link) => link.closest('.app-shell__nav'))).toHaveLength(4);
expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/map');
expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity');
expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages');
expect(screen.getByRole('link', { name: 'My space' })).toHaveAttribute('href', '/me');
expect(screen.getByRole('button', { name: 'Leave footprint' })).toBeVisible();
expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', '/notifications');
expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
```

Change the language select to Japanese and assert the publish label becomes
`足跡を残す` and local storage contains `ja`.

- [ ] **Step 2: Run the shell test and verify it fails**

Run:

```powershell
npm.cmd exec vitest run apps/web/src/app/__tests__/AppShell.test.tsx
```

Expected: FAIL because the responsive shell and locale switcher do not exist.

- [ ] **Step 3: Implement the locale switcher**

```tsx
import { useTranslation } from 'react-i18next';
import { persistLocale, supportedLocales, type AppLocale } from '../i18n/locale.js';

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const value = (i18n.resolvedLanguage ?? i18n.language) as AppLocale;
  return <label className="locale-switcher"><span>{t('common.language')}</span><select aria-label={t('common.language')} value={value} onChange={(event) => { const locale = event.target.value as AppLocale; persistLocale(window.localStorage, locale); void i18n.changeLanguage(locale); }}>{supportedLocales.map((locale) => <option key={locale} value={locale}>{t(locale === 'zh-CN' ? 'locale.zhCN' : `locale.${locale}`)}</option>)}</select></label>;
}
```

- [ ] **Step 4: Rewrite AppShell with four destinations**

Use `Map`, `Compass`, `MessageCircle`, `UserRound`, `Bell`, and `Plus` from
Lucide React. Keep notifications in the header, not the destination array. Use
translation keys for every label. The public shape is:

```tsx
const destinations = [
  { href: '/map', key: 'map', Icon: Map },
  { href: '/activity', key: 'activity', Icon: Compass },
  { href: '/messages', key: 'messages', Icon: MessageCircle },
  { href: '/me', key: 'me', Icon: UserRound },
] as const;
```

The `<header>` contains brand, current-context slot, notifications,
`LocaleSwitcher`, and a coral publish button. The `<nav>` maps exactly the four
destinations and includes icon plus translated text. Preserve the existing
point-from-URL behavior in the publish handler.

- [ ] **Step 5: Implement responsive shell CSS**

Requirements:

- mobile: fixed top bar, full content reservation, fixed four-item bottom nav,
  safe-area padding, separate coral publish command;
- tablet: stable top/header controls and optional docked content width;
- desktop at 1200px+: left or bottom navigation may become a compact focus rail,
  but DOM order and labels stay unchanged;
- no viewport-based font-size scaling;
- every control remains at least 44px;
- all Japanese labels wrap or truncate without overlap;
- `prefers-reduced-motion` removes nonessential transitions.

- [ ] **Step 6: Run shell and existing router tests**

```powershell
npm.cmd exec vitest run apps/web/src/app/__tests__/AppShell.test.tsx apps/web/src/app/__tests__/router.test.tsx
```

Expected: both files PASS.

- [ ] **Step 7: Commit the shell**

```powershell
git add apps/web/src/app/AppShell.tsx apps/web/src/app/LocaleSwitcher.tsx apps/web/src/app/app-shell.css apps/web/src/app/__tests__/AppShell.test.tsx apps/web/src/app/__tests__/router.test.tsx
git commit -m "feat: redesign the trilingual app shell"
```

### Task 6: Translate Global Error and Session States

**Files:**

- Modify: `apps/web/src/app/ErrorBoundary.tsx`
- Modify: `apps/web/src/app/guards/RequireAuth.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/__tests__/ErrorBoundary.test.tsx`
- Modify: `apps/web/src/app/__tests__/router.test.tsx`

- [ ] **Step 1: Add failing translated-state tests**

Add tests that render `/session-expired` and an unknown route with Japanese
i18n, then assert headings `セッションの有効期限が切れました` and
`ページが見つかりません`. Add a loading guard test that asserts
`ログイン状態を確認中`.

In `ErrorBoundary.test.tsx`, render a child component that throws under the
Japanese provider and assert the translated alert contains
`アプリを続行できません`.

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm.cmd exec vitest run apps/web/src/app/__tests__/router.test.tsx apps/web/src/app/__tests__/ErrorBoundary.test.tsx
```

Expected: FAIL because global state strings remain hardcoded English.

- [ ] **Step 3: Translate the state components**

- Wrap the existing error-boundary class with a functional component that calls
  `useTranslation()` and passes a `StatusView` fallback into the class.
- Use `useTranslation()` in `RequireAuth` for `session.loading`.
- Replace inline `NotFound` and `SessionExpired` implementations with components
  using `StatusView`, translated copy, and a map/sign-in command.
- Preserve `location.state.from` and pending-action behavior exactly.

- [ ] **Step 4: Run focused tests**

```powershell
npm.cmd exec vitest run apps/web/src/app apps/web/src/i18n packages/ui/src/__tests__/primitives.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit global states**

```powershell
git add apps/web/src/app
git commit -m "feat: unify translated shell states"
```

### Task 7: Verify Six Viewports and Three Locales

**Files:**

- Create: `apps/web/e2e/spatial-shell.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add tablet and wide projects**

Append:

```ts
{ name: 'tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
{ name: 'wide-1920x1080', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
```

Keep the existing three mobile and 1440 desktop projects.

- [ ] **Step 2: Write the failing shell E2E test**

```ts
import { expect, test } from '@playwright/test';
import { installJourneyApi } from './journey-api.js';
import { expectNoAxeViolations, expectNoHorizontalOverflow } from './accessibility.js';

const locales = [
  { locale: 'zh-CN', map: '地图', publish: '留下足迹' },
  { locale: 'en', map: 'Map', publish: 'Leave footprint' },
  { locale: 'ja', map: '地図', publish: '足跡を残す' },
] as const;

for (const sample of locales) {
  test(`shell is complete in ${sample.locale}`, async ({ page }) => {
    await page.addInitScript(({ locale }) => localStorage.setItem('bliver.locale', locale), { locale: sample.locale });
    await installJourneyApi(page, 'userA');
    await page.goto('/map');
    await expect(page.locator('html')).toHaveAttribute('lang', sample.locale);
    await expect(page.getByRole('link', { name: sample.map })).toBeVisible();
    await expect(page.getByRole('button', { name: sample.publish })).toBeVisible();
    await expect(page.locator('.app-shell__nav-link')).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
}
```

- [ ] **Step 3: Run the focused E2E test**

Run:

```powershell
npx.cmd playwright test apps/web/e2e/spatial-shell.spec.ts
```

Expected: 18 tests PASS, three locales across six projects.

- [ ] **Step 4: Add touch-target and reduced-motion checks**

In the same spec, verify every shell control has a bounding box at least 44x44,
the Japanese shell has no overlap at 360x800, and reduced-motion yields
transition durations no greater than 0.01ms for shell movement.

- [ ] **Step 5: Run shell E2E again**

```powershell
npx.cmd playwright test apps/web/e2e/spatial-shell.spec.ts
```

Expected: all locale, touch-target, overflow, axe, and reduced-motion checks PASS
in every configured project.

- [ ] **Step 6: Commit viewport coverage**

```powershell
git add playwright.config.ts apps/web/e2e/spatial-shell.spec.ts
git commit -m "test: verify spatial shell across locales"
```

### Task 8: Run the Milestone Gate

**Files:**

- Create: `docs/qa/v2-spatial-cinema-m1-foundation.md`

- [ ] **Step 1: Run focused gates**

```powershell
npm.cmd run lint:v2
npm.cmd run typecheck:v2
npm.cmd run test:v2
npm.cmd run build:v2
npx.cmd playwright test apps/web/e2e/spatial-shell.spec.ts apps/web/e2e/accessibility.spec.ts
git diff --check
```

Expected: every command exits 0; lint has zero warnings; Vitest and Playwright
report zero failed tests; API and Web builds emit successfully.

- [ ] **Step 2: Inspect build chunks**

Run:

```powershell
Get-ChildItem apps/web/dist/assets | Sort-Object Length -Descending | Select-Object Name,Length
```

Expected: no MapLibre or Three.js dependency is present yet; this milestone
must not increase the map runtime surface.

- [ ] **Step 3: Record milestone evidence**

Create `docs/qa/v2-spatial-cinema-m1-foundation.md` with:

```markdown
# Spatial Cinema Milestone 1: Foundation Evidence

Date: 2026-07-18
Scope: Natural City primitives, trilingual runtime, responsive shell, global states
Status: PASS

- V2 lint: PASS, zero warnings
- V2 typecheck: PASS
- V2 Vitest: PASS, zero failed tests
- API/Web production build: PASS
- Six-project shell Playwright: PASS
- Accessibility Playwright: PASS
- Simplified Chinese, English, and Japanese shell journeys: PASS
- `git diff --check`: PASS

No map engine, backend contract, privacy policy, database, production
environment, or real secret changed in this milestone.
```

Replace the status with `BLOCKED` rather than writing `PASS` if any command in
Step 1 fails.

- [ ] **Step 4: Commit milestone evidence**

```powershell
git add docs/qa/v2-spatial-cinema-m1-foundation.md
git commit -m "docs: record spatial cinema foundation evidence"
```

- [ ] **Step 5: Confirm the handoff state**

```powershell
git status --short
git log -8 --oneline
```

Expected: no uncommitted files from this milestone. Pre-existing Phase 0/1
evidence files may remain untracked and must not be silently added. The next
plan is `docs/superpowers/plans/2026-07-18-spatial-maplibre-migration.md`.
