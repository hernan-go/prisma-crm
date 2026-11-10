import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import express from 'express';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { memorySessions, testCredentials } from './auth-helper.js';

const credentials = await testCredentials();
let server: Server;
const codecs = {
  identity: (body: Buffer) => body,
  gzip: gzipSync,
  deflate: deflateSync,
  br: brotliCompressSync,
};

function port(target: Server) {
  const address = target.address();
  if (!address || typeof address === 'string') throw Error('Expected a TCP listener');
  return address.port;
}

function send(target: Server, path: string, body: Buffer, encoding = 'identity') {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: port(target),
        path,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': encoding,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(text) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(Error('HTTP parser test timed out')));
    req.end(body);
  });
}

beforeAll(async () => {
  server = createApp(
    { ...credentials, store: memorySessions() },
    { tokenHash: '' },
    { tokenHash: '' },
    false,
  ).listen(0, '127.0.0.1');
  await once(server, 'listening');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

it.each(Object.entries(codecs))(
  'preserves JSON login with %s encoding',
  async (encoding, encode) => {
    const response = await send(
      server,
      '/api/auth/login',
      encode(Buffer.from(JSON.stringify({ password: credentials.password }))),
      encoding,
    );
    expect(response).toEqual({ status: 200, body: { ok: true } });
  },
);

it('preserves malformed JSON rejection before authentication', async () => {
  expect(await send(server, '/api/people', Buffer.from('{'))).toEqual({
    status: 400,
    body: { message: 'Solicitud JSON inválida.' },
  });
});

it('preserves schema validation after decompressing JSON', async () => {
  const response = await send(server, '/api/auth/login', gzipSync(Buffer.from('{}')), 'gzip');
  expect(response.status).toBe(422);
  expect(response.body.issues).toBeInstanceOf(Array);
});

it.each(['identity', 'gzip'] as const)(
  'keeps the 8 MiB decoded limit with %s encoding',
  async (encoding) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // At the limit, parsing succeeds and authentication blocks this DB route.
      const within = Buffer.from(JSON.stringify({ data: 'x'.repeat(8 * 1024 * 1024 - 11) }));
      expect(within.length).toBe(8 * 1024 * 1024);
      expect((await send(server, '/api/people', codecs[encoding](within), encoding)).status).toBe(
        401,
      );
      const above = Buffer.from(JSON.stringify({ data: 'x'.repeat(8 * 1024 * 1024) }));
      const response = await send(server, '/api/people', codecs[encoding](above), encoding);
      // Existing application error contract: entity.too.large currently maps to 500.
      expect(response).toEqual({
        status: 500,
        body: { message: 'No se pudo completar la operación. Intentá nuevamente.' },
      });
    } finally {
      log.mockRestore();
    }
  },
);

it('survives malformed compression and serves a subsequent request', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await send(server, '/api/people', Buffer.from('invalid gzip'), 'gzip');
    expect(response.status).toBe(500); // Existing generic error mapping, without decoder details.
    expect(response.body).toEqual({
      message: 'No se pudo completar la operación. Intentá nuevamente.',
    });
    expect(await send(server, '/api/auth/logout', Buffer.from('{}'))).toEqual({
      status: 200,
      body: { ok: true },
    });
  } finally {
    log.mockRestore();
  }
});

it('detaches a finished decoder before delayed trailing bytes (GHSA-27r3-jxmh-p828)', async () => {
  // Coordinate the second write with parser completion, rather than relying on TCP timing.
  // The request remains open until all trailing bytes arrive, as in the upstream regression.
  const fixture = express();
  const first = Buffer.concat([deflateSync(Buffer.from('{"probe":true}')), Buffer.from([0])]);
  const trailing = Buffer.alloc(1024);
  let releaseTrailing: () => void;
  const parsed = new Promise<void>((resolve) => (releaseTrailing = resolve));
  fixture.use(express.json());
  fixture.use((req, res) => {
    releaseTrailing();
    req.once('end', () => res.json(req.body));
  });
  const target = fixture.listen(0, '127.0.0.1');
  await once(target, 'listening');
  try {
    const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: port(target),
          method: 'POST',
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'Content-Encoding': 'deflate',
            'Content-Length': first.length + trailing.length,
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (text += chunk));
          res.on('error', reject);
          res.on('end', () => resolve({ status: res.statusCode!, text }));
        },
      );
      req.on('error', reject);
      req.setTimeout(3000, () => req.destroy(Error('Trailing bytes test timed out')));
      void parsed.then(() => req.end(trailing));
      req.write(first);
    });
    expect(response).toEqual({ status: 200, text: '{"probe":true}' });
    expect(await send(server, '/api/auth/logout', Buffer.from('{}'))).toEqual({
      status: 200,
      body: { ok: true },
    });
  } finally {
    target.closeAllConnections();
    await new Promise<void>((resolve) => target.close(() => resolve()));
  }
});
