import { verifyMapProviderRelease } from './map-provider.js';

const provider = verifyMapProviderRelease({
  ...(process.env.VITE_MAP_STYLE_URL !== undefined
    ? { styleUrl: process.env.VITE_MAP_STYLE_URL }
    : {}),
  ...(process.env.VITE_MAP_ATTRIBUTION_JSON !== undefined
    ? { attributionJson: process.env.VITE_MAP_ATTRIBUTION_JSON }
    : {}),
  ...(process.env.MAP_PROVIDER_EMERGENCY !== undefined
    ? { emergencyApproved: process.env.MAP_PROVIDER_EMERGENCY }
    : {}),
  ...(process.env.MAP_PROVIDER_EMERGENCY_EXPIRES_AT !== undefined
    ? { emergencyExpiresAt: process.env.MAP_PROVIDER_EMERGENCY_EXPIRES_AT }
    : {}),
});

console.log(`V2 map provider verified mode=${provider.mode}`);
