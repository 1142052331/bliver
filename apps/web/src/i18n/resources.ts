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
  readonly map: {
    readonly title: string;
    readonly loading: string;
    readonly offlineTitle: string;
    readonly offlineBody: string;
    readonly unavailableTitle: string;
    readonly unavailableBody: string;
    readonly searchPlaces: string;
    readonly search: string;
    readonly closeSearch: string;
    readonly placeSearch: string;
    readonly noPlacesFound: string;
    readonly searchUnavailable: string;
    readonly locateMe: string;
    readonly locating: string;
    readonly locationUnavailable: string;
    readonly visibility: string;
    readonly visibilityAll: string;
    readonly visibilityPublic: string;
    readonly visibilityFriends: string;
    readonly visibilityPrivate: string;
    readonly emptyTitle: string;
    readonly emptyBody: string;
    readonly preview: string;
    readonly public: string;
    readonly friendsOnly: string;
    readonly onlyYou: string;
    readonly preciseLocation: string;
    readonly approximateLocation: string;
    readonly openFootprint: string;
    readonly interactiveMap: string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly nearbyFootprints: string;
    readonly footprintCount: string;
    readonly footprintCount_one: string;
    readonly footprintCount_other: string;
    readonly footprintBy: string;
    readonly selected: string;
    readonly staticReducedTitle: string;
    readonly staticUnavailableTitle: string;
    readonly staticSummary: string;
    readonly staticSummary_one: string;
    readonly staticSummary_other: string;
    readonly mapAttribution: string;
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
  map: {
    title: 'Map',
    loading: 'Loading map',
    offlineTitle: 'Map offline',
    offlineBody: 'Reconnect to load footprints. Your private map data is not cached.',
    unavailableTitle: 'Map unavailable',
    unavailableBody: 'We could not load footprints.',
    searchPlaces: 'Search places',
    search: 'Search',
    closeSearch: 'Close search',
    placeSearch: 'Place search',
    noPlacesFound: 'No places found.',
    searchUnavailable: 'Place search is unavailable. Try again.',
    locateMe: 'Locate me',
    locating: 'Locating...',
    locationUnavailable: 'Location is unavailable. You can keep browsing the map.',
    visibility: 'Visibility',
    visibilityAll: 'All',
    visibilityPublic: 'Public',
    visibilityFriends: 'Friends',
    visibilityPrivate: 'Private',
    emptyTitle: 'No footprints here yet',
    emptyBody: 'Try another area or publish the first moment.',
    preview: 'Footprint preview',
    public: 'Public',
    friendsOnly: 'Friends only',
    onlyYou: 'Only you',
    preciseLocation: 'Precise location',
    approximateLocation: 'Approximate location',
    openFootprint: 'Open footprint',
    interactiveMap: 'Interactive footprint map',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    nearbyFootprints: 'Nearby footprints',
    footprintCount: '{{count}} footprint',
    footprintCount_one: '1 footprint',
    footprintCount_other: '{{count}} footprints',
    footprintBy: 'Footprint by {{name}}',
    selected: 'Selected',
    staticReducedTitle: 'Calm map view',
    staticUnavailableTitle: 'Interactive map unavailable',
    staticSummary: '{{count}} footprints around {{lat}}, {{lng}}. Use the list to explore.',
    staticSummary_one: '1 footprint around {{lat}}, {{lng}}. Use the list to explore.',
    staticSummary_other: '{{count}} footprints around {{lat}}, {{lng}}. Use the list to explore.',
    mapAttribution: 'Map data attribution',
  },
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
  map: {
    title: '地图',
    loading: '正在加载地图',
    offlineTitle: '地图已离线',
    offlineBody: '重新联网后即可加载足迹。你的私密地图数据不会被缓存。',
    unavailableTitle: '地图暂时不可用',
    unavailableBody: '目前无法加载足迹。',
    searchPlaces: '搜索地点',
    search: '搜索',
    closeSearch: '关闭搜索',
    placeSearch: '地点搜索',
    noPlacesFound: '没有找到相关地点。',
    searchUnavailable: '地点搜索暂时不可用，请稍后再试。',
    locateMe: '定位到我',
    locating: '正在定位...',
    locationUnavailable: '无法获取当前位置，你仍可继续浏览地图。',
    visibility: '可见范围',
    visibilityAll: '全部',
    visibilityPublic: '公开',
    visibilityFriends: '好友',
    visibilityPrivate: '私密',
    emptyTitle: '这里还没有足迹',
    emptyBody: '换个区域看看，或留下这里的第一个瞬间。',
    preview: '足迹预览',
    public: '公开',
    friendsOnly: '仅好友',
    onlyYou: '仅自己',
    preciseLocation: '精确位置',
    approximateLocation: '大致位置',
    openFootprint: '打开足迹',
    interactiveMap: '互动足迹地图',
    zoomIn: '放大地图',
    zoomOut: '缩小地图',
    nearbyFootprints: '附近足迹',
    footprintCount: '{{count}} 条足迹',
    footprintCount_one: '{{count}} 条足迹',
    footprintCount_other: '{{count}} 条足迹',
    footprintBy: '{{name}} 的足迹',
    selected: '已选择',
    staticReducedTitle: '静谧地图视图',
    staticUnavailableTitle: '互动地图暂时不可用',
    staticSummary: '{{lat}}, {{lng}} 附近有 {{count}} 条足迹，可通过列表继续浏览。',
    staticSummary_one: '{{lat}}, {{lng}} 附近有 {{count}} 条足迹，可通过列表继续浏览。',
    staticSummary_other: '{{lat}}, {{lng}} 附近有 {{count}} 条足迹，可通过列表继续浏览。',
    mapAttribution: '地图数据署名',
  },
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
  map: {
    title: '地図',
    loading: '地図を読み込み中',
    offlineTitle: '地図はオフラインです',
    offlineBody: '再接続すると足跡を読み込めます。非公開の地図データはキャッシュされません。',
    unavailableTitle: '地図を利用できません',
    unavailableBody: '足跡を読み込めませんでした。',
    searchPlaces: '場所を検索',
    search: '検索',
    closeSearch: '検索を閉じる',
    placeSearch: '場所の検索',
    noPlacesFound: '場所が見つかりませんでした。',
    searchUnavailable: '場所を検索できません。もう一度お試しください。',
    locateMe: '現在地へ移動',
    locating: '現在地を確認中...',
    locationUnavailable: '現在地を取得できません。地図の閲覧は続けられます。',
    visibility: '公開範囲',
    visibilityAll: 'すべて',
    visibilityPublic: '公開',
    visibilityFriends: '友達',
    visibilityPrivate: '非公開',
    emptyTitle: 'この場所にはまだ足跡がありません',
    emptyBody: '別のエリアを見るか、最初の瞬間を残してみましょう。',
    preview: '足跡のプレビュー',
    public: '公開',
    friendsOnly: '友達のみ',
    onlyYou: '自分のみ',
    preciseLocation: '正確な位置',
    approximateLocation: 'おおよその位置',
    openFootprint: '足跡を開く',
    interactiveMap: 'インタラクティブ足跡マップ',
    zoomIn: '地図を拡大',
    zoomOut: '地図を縮小',
    nearbyFootprints: '近くの足跡',
    footprintCount: '{{count}}件の足跡',
    footprintCount_one: '{{count}}件の足跡',
    footprintCount_other: '{{count}}件の足跡',
    footprintBy: '{{name}}さんの足跡',
    selected: '選択中',
    staticReducedTitle: '穏やかな地図表示',
    staticUnavailableTitle: 'インタラクティブ地図を利用できません',
    staticSummary: '{{lat}}, {{lng}} 周辺に{{count}}件の足跡があります。リストから閲覧できます。',
    staticSummary_one: '{{lat}}, {{lng}} 周辺に{{count}}件の足跡があります。リストから閲覧できます。',
    staticSummary_other: '{{lat}}, {{lng}} 周辺に{{count}}件の足跡があります。リストから閲覧できます。',
    mapAttribution: '地図データの帰属表示',
  },
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
