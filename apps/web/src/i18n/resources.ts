import type { AppLocale } from './locale.js';

export interface FoundationTranslation {
  readonly common: {
    readonly brand: string;
    readonly notifications: string;
    readonly language: string;
    readonly primaryNavigation: string;
    readonly retry: string;
    readonly close: string;
    readonly loading: string;
  };
  readonly nav: {
    readonly map: string;
    readonly activity: string;
    readonly messages: string;
    readonly me: string;
  };
  readonly actions: {
    readonly publish: string;
  };
  readonly locale: {
    readonly zhCN: string;
    readonly en: string;
    readonly ja: string;
  };
  readonly session: {
    readonly loading: string;
    readonly loadingBody: string;
    readonly expiredTitle: string;
    readonly expiredBody: string;
    readonly signIn: string;
  };
  readonly errors: {
    readonly unexpectedTitle: string;
    readonly unexpectedBody: string;
    readonly notFoundTitle: string;
    readonly notFoundBody: string;
  };
}

const en = {
  common: {
    brand: 'Bliver',
    notifications: 'Notifications',
    language: 'Language',
    primaryNavigation: 'Primary navigation',
    retry: 'Try again',
    close: 'Close',
    loading: 'Loading',
  },
  nav: {
    map: 'Map',
    activity: 'Activity',
    messages: 'Messages',
    me: 'My space',
  },
  actions: { publish: 'Leave footprint' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: 'Loading session',
    loadingBody: 'Preparing your map and account.',
    expiredTitle: 'Session expired',
    expiredBody: 'Sign in again to continue.',
    signIn: 'Continue to sign in',
  },
  errors: {
    unexpectedTitle: 'Something went wrong',
    unexpectedBody: 'Reload the app and try again.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'Return to the map to continue.',
  },
} satisfies FoundationTranslation;

const zhCN = {
  common: {
    brand: 'Bliver',
    notifications: '通知',
    language: '语言',
    primaryNavigation: '主导航',
    retry: '重试',
    close: '关闭',
    loading: '加载中',
  },
  nav: { map: '地图', activity: '动态', messages: '消息', me: '我的' },
  actions: { publish: '留下足迹' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: '正在确认登录状态',
    loadingBody: '正在准备地图和账号信息。',
    expiredTitle: '登录已过期',
    expiredBody: '请重新登录后继续。',
    signIn: '前往登录',
  },
  errors: {
    unexpectedTitle: '应用暂时无法继续',
    unexpectedBody: '请重新加载后再试。',
    notFoundTitle: '找不到这个页面',
    notFoundBody: '返回地图继续浏览。',
  },
} satisfies FoundationTranslation;

const ja = {
  common: {
    brand: 'Bliver',
    notifications: '通知',
    language: '言語',
    primaryNavigation: 'メインナビゲーション',
    retry: 'もう一度試す',
    close: '閉じる',
    loading: '読み込み中',
  },
  nav: {
    map: '地図',
    activity: 'アクティビティ',
    messages: 'メッセージ',
    me: 'マイページ',
  },
  actions: { publish: '足跡を残す' },
  locale: { zhCN: '简体中文', en: 'English', ja: '日本語' },
  session: {
    loading: 'ログイン状態を確認中',
    loadingBody: '地図とアカウント情報を準備しています。',
    expiredTitle: 'セッションの有効期限が切れました',
    expiredBody: '続けるには、もう一度サインインしてください。',
    signIn: 'サインインへ進む',
  },
  errors: {
    unexpectedTitle: 'アプリを続行できません',
    unexpectedBody: '再読み込みして、もう一度お試しください。',
    notFoundTitle: 'ページが見つかりません',
    notFoundBody: '地図に戻って続けてください。',
  },
} satisfies FoundationTranslation;

const translations = {
  'zh-CN': zhCN,
  en,
  ja,
} satisfies Record<AppLocale, FoundationTranslation>;

export const resources = {
  'zh-CN': { translation: translations['zh-CN'] },
  en: { translation: translations.en },
  ja: { translation: translations.ja },
} as const;
