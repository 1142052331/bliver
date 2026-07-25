import {
  geoPoint,
  publishFootprintRequest,
  type PublishFootprintRequest,
} from '@bliver/contracts';
import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import {
  PublishFootprintRoute,
  type PublishFootprintRouteProps,
} from '../../features/footprints/PublishFootprintRoute.js';
import { mutationHeaders } from '../../features/footprints/csrf.js';
import { uploadMedia } from '../../features/footprints/media-upload.js';

function pointFrom(
  value: unknown,
): { readonly lat: number; readonly lng: number } | undefined {
  const parsed = geoPoint.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function publishFootprint(
  input: PublishFootprintRouteProps['publish'] extends (
    value: infer T,
  ) => Promise<void>
    ? T
    : never,
): Promise<void> {
  const payload: PublishFootprintRequest = publishFootprintRequest.parse({
    ...input,
    mediaAssetIds: input.mediaAssetIds ?? [],
  });
  const response = await fetch('/api/v1/footprints', {
    method: 'POST',
    credentials: 'include',
    headers: mutationHeaders({
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error('Publish failed');
}

export function Component() {
  const [params] = useSearchParams();
  const location = useLocation();
  const statePoint = pointFrom(
    (location.state as { initialPoint?: unknown } | null)?.initialPoint,
  );
  const lat = params.get('lat');
  const lng = params.get('lng');
  const queryPoint =
    lat !== null && lng !== null
      ? pointFrom({ lat: Number(lat), lng: Number(lng) })
      : undefined;
  const [initialPoint] = useState(() => statePoint ?? queryPoint);
  const [mapSearch] = useState(() => location.search);

  return (
    <PublishFootprintRoute
      {...(initialPoint ? { initialPoint } : {})}
      mapHref={`/map${mapSearch}`}
      publish={publishFootprint}
      signUpload={uploadMedia}
    />
  );
}
