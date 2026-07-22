import { resolve } from 'node:path';
import type { Page, WebSocketRoute } from '@playwright/test';
import { loadEnv } from 'vite';

const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:5173';
const V2_BUILD_ENV = loadEnv('v2', resolve('.'), 'VITE_');

// MapCanvas applies the Natural City style transform to provider styles.
export const CONTROLLED_MAP_BACKGROUND_RGB = [250, 248, 243] as const;

const CONTROLLED_MAP_STYLE = {
  version: 8,
  name: 'Bliver E2E controlled map',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': `rgb(${CONTROLLED_MAP_BACKGROUND_RGB.join(', ')})`,
      },
    },
  ],
} as const;

function configuredStyleUrl(): URL {
  const configured = process.env.VITE_MAP_STYLE_URL?.trim()
    || V2_BUILD_ENV.VITE_MAP_STYLE_URL?.trim()
    || DEFAULT_MAP_STYLE_URL;
  const webOrigin = process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_WEB_ORIGIN;
  return new URL(configured, new URL('/', webOrigin));
}

function isConfiguredStyleRequest(requestUrl: URL, styleUrl: URL): boolean {
  return requestUrl.origin === styleUrl.origin
    && requestUrl.pathname === styleUrl.pathname
    && (!styleUrl.search || requestUrl.search === styleUrl.search);
}

function isOpenFreeMapRequest(url: URL): boolean {
  return url.hostname === 'openfreemap.org' || url.hostname.endsWith('.openfreemap.org');
}

export async function installControlledMapTiles(page: Page): Promise<void> {
  const mapStyleUrl = configuredStyleUrl();
  await page.route(
    (url) => isConfiguredStyleRequest(url, mapStyleUrl) || isOpenFreeMapRequest(url),
    (route) => {
      if (!isConfiguredStyleRequest(new URL(route.request().url()), mapStyleUrl)) {
        return route.abort('blockedbyclient');
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONTROLLED_MAP_STYLE),
      });
    },
  );
}

export async function installUnavailableMapProvider(page: Page): Promise<void> {
  const mapStyleUrl = configuredStyleUrl();
  await page.route(
    (url) => isConfiguredStyleRequest(url, mapStyleUrl),
    (route) => route.abort('connectionfailed'),
  );
}

interface ControlledMapRealtime {
  readonly emitFootprintPublished: (payload?: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly waitUntilConnected: () => Promise<void>;
}

export async function installControlledMapRealtime(page: Page): Promise<ControlledMapRealtime> {
  let connectedSocketRoute: WebSocketRoute | undefined;
  let resolveConnected: (() => void) | undefined;
  const connection = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });

  await page.routeWebSocket('**/socket.io/**', (webSocket) => {
    webSocket.onMessage((message) => {
      const packet = typeof message === 'string' ? message : message.toString('utf8');
      if (packet === '40' || packet.startsWith('40{')) {
        webSocket.send('40{"sid":"bliver-map-e2e"}');
        connectedSocketRoute = webSocket;
        resolveConnected?.();
      }
    });
    webSocket.send('0{"sid":"bliver-engine-e2e","upgrades":[],"pingInterval":60000,"pingTimeout":5000,"maxPayload":1000000}');
  });

  return {
    waitUntilConnected: () => connection,
    emitFootprintPublished: async (payload = {}) => {
      await connection;
      if (!connectedSocketRoute) throw new Error('Controlled Socket.IO route was not installed');
      connectedSocketRoute.send(`42${JSON.stringify(['footprint:published', payload])}`);
    },
  };
}
