import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

import {
  requireActor,
  validMutationCsrf,
  type ActorContext,
  type IdentityRepositories,
} from '../../identity/index.js';
import type { NotificationService } from '../domain/service.js';

export interface NotificationRouterOptions {
  readonly service: NotificationService;
  readonly vapidPublicKey?: string;
}

const actor = (request: Request) =>
  (request as Request & { actor?: ActorContext }).actor;

function acceptsMutation(
  request: Request,
  response: Response,
  current: ActorContext,
): boolean {
  if (validMutationCsrf(request, current)) return true;
  response.status(403).json({ code: 'CSRF_ORIGIN_INVALID' });
  return false;
}

export function notificationsRouter(
  options: NotificationRouterOptions,
  identity: IdentityRepositories,
): Router {
  const router = Router();
  const auth = requireActor(identity);

  router.get('/notifications', auth, async (request, response) => {
    const current = actor(request);
    if (!current) return;
    const cursor = typeof request.query.cursor === 'string'
      ? request.query.cursor
      : undefined;
    response.json(await options.service.list(current.userId, cursor));
  });

  router.post('/notifications/:id/read', auth, async (request, response) => {
    const current = actor(request);
    if (!current || !acceptsMutation(request, response, current)) return;
    await options.service.markRead(current.userId, String(request.params.id));
    response.status(204).end();
  });

  router.post('/notifications/read-all', auth, async (request, response) => {
    const current = actor(request);
    if (!current || !acceptsMutation(request, response, current)) return;
    await options.service.markAllRead(current.userId);
    response.status(204).end();
  });

  router.get('/notifications/preferences', auth, async (request, response) => {
    const current = actor(request);
    if (!current) return;
    response.json(await options.service.getPreferences(current.userId));
  });

  router.put('/notifications/preferences', auth, async (request, response) => {
    const current = actor(request);
    if (!current || !acceptsMutation(request, response, current)) return;
    response.json(
      await options.service.setPreferences(
        current.userId,
        request.body as Record<string, boolean>,
      ),
    );
  });

  router.get('/push/public-key', (_request, response) => {
    if (!options.vapidPublicKey) {
      response.status(404).json({ code: 'PUSH_UNAVAILABLE' });
      return;
    }
    response.json({ publicKey: options.vapidPublicKey });
  });

  router.post('/push/subscribe', auth, async (request, response) => {
    const current = actor(request);
    if (!current || !acceptsMutation(request, response, current)) return;
    const input = request.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!input.endpoint || !input.keys?.p256dh || !input.keys.auth) {
      response.status(400).json({ code: 'INVALID_REQUEST' });
      return;
    }
    await options.service.subscribe({
      id: randomUUID(),
      userId: current.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    });
    response.status(201).json({ ok: true });
  });

  router.post('/push/unsubscribe', auth, async (request, response) => {
    const current = actor(request);
    if (!current || !acceptsMutation(request, response, current)) return;
    if (typeof request.body?.endpoint !== 'string') {
      response.status(400).json({ code: 'INVALID_REQUEST' });
      return;
    }
    await options.service.unsubscribe(current.userId, request.body.endpoint);
    response.status(204).end();
  });

  return router;
}
