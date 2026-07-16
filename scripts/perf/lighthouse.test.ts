import { Agent, createServer, get, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import * as lighthouseModule from './lighthouse.js';

type ShutdownHttpServer = (server: Server, timeoutMs?: number) => Promise<void>;

const shutdownHttpServer = (lighthouseModule as typeof lighthouseModule & {
  readonly shutdownHttpServer: ShutdownHttpServer;
}).shutdownHttpServer;

const servers: Server[] = [];
const agents: Agent[] = [];

async function keepAliveServer(): Promise<{ readonly server: Server; readonly agent: Agent }> {
  const server = createServer((_request, response) => {
    response.setHeader('connection', 'keep-alive');
    response.write('ok');
  });
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server address unavailable');
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  agents.push(agent);
  await new Promise<void>((resolveRequest, rejectRequest) => {
    get({ host: '127.0.0.1', port: address.port, agent }, (response) => {
      response.once('error', () => undefined);
      response.resume();
      resolveRequest();
    }).once('error', rejectRequest);
  });
  return { server, agent };
}

async function connectionCount(server: Server): Promise<number> {
  return new Promise((resolveConnections, rejectConnections) => {
    server.getConnections((error, count) => error ? rejectConnections(error) : resolveConnections(count));
  });
}

afterEach(async () => {
  for (const agent of agents.splice(0)) agent.destroy();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

describe('Lighthouse fixture server shutdown', () => {
  it('reproduces native close waiting on a keep-alive client', async () => {
    const { server } = await keepAliveServer();
    let closed = false;
    const close = new Promise<void>((resolveClose) => server.close(() => {
      closed = true;
      resolveClose();
    }));

    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    expect(closed).toBe(false);
    server.closeAllConnections();
    await close;
  });

  it('closes keep-alive connections within a bounded interval', async () => {
    const { server } = await keepAliveServer();

    await shutdownHttpServer(server, 100);

    expect(server.listening).toBe(false);
    expect(await connectionCount(server)).toBe(0);
  });

  it('resolves when cleanup runs for a server that never listened', async () => {
    const server = createServer();
    servers.push(server);
    await expect(shutdownHttpServer(server, 100)).resolves.toBeUndefined();
  });
});
