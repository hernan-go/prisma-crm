import { afterEach, expect, it, vi } from 'vitest';
import { resolve, dirname } from 'node:path';
import { constants } from 'node:fs';
import {
  createPrivateDiagnosticLog,
  diagnosticFileLimit,
  diagnosticFileName,
  type DiagnosticFileIO,
} from '../server/proxy-diagnostic-file.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const directory = resolve('/private-account/.prisma-proxy-diagnostics');
const applicationRoot = resolve('/application-root');
const filePath = resolve(directory, diagnosticFileName);
const lockPath = resolve(directory, 'proxy-diagnostics.lock');
const record = { event: 'proxy_diagnostic', probe: 'baseline', socket_peer: '127.0.0.1' };

// Permission/ownership semantics are explicitly simulated POSIX metadata: the
// local runner is Windows. These tests never claim to verify hosting permissions.
function fixture() {
  type Node = {
    kind: 'directory' | 'file' | 'symlink';
    uid: number;
    mode: number;
    nlink: number;
    content: string;
  };
  const nodes = new Map<string, Node>();
  for (let path = directory; ; path = dirname(path)) {
    nodes.set(path, { kind: 'directory', uid: 1000, mode: 0o700, nlink: 1, content: '' });
    if (path === dirname(path)) break;
  }
  const metadata = (node: Node) => ({
    ...node,
    size: Buffer.byteLength(node.content),
    isDirectory: () => node.kind === 'directory',
    isFile: () => node.kind === 'file',
    isSymbolicLink: () => node.kind === 'symlink',
  });
  const fail = (code: string): never => {
    throw Object.assign(new Error('simulated filesystem error'), { code });
  };
  const io: DiagnosticFileIO = {
    realpath: vi.fn(async (path) => path),
    lstat: vi.fn(async (path) => {
      const n = nodes.get(path);
      if (!n) return fail('ENOENT');
      return metadata(n);
    }),
    open: vi.fn(async (path, flags, mode) => {
      let node = nodes.get(path);
      if (node && flags & constants.O_EXCL) return fail('EEXIST');
      if (node?.kind === 'symlink') return fail('ELOOP');
      if (!node) {
        if (!(flags & constants.O_CREAT)) return fail('ENOENT');
        node = { kind: 'file', uid: 1000, mode: mode!, nlink: 1, content: '' };
        nodes.set(path, node);
      }
      const opened = node;
      return {
        stat: async () => metadata(opened),
        writeFile: async (line: string) => {
          opened.content += line;
        },
        close: async () => {},
      };
    }),
    unlink: vi.fn(async (path) => {
      nodes.delete(path);
    }),
  };
  const make = (custom: Partial<Parameters<typeof createPrivateDiagnosticLog>[0]> = {}) =>
    createPrivateDiagnosticLog({
      directory,
      applicationRoot,
      identity: { platform: 'linux', uid: 1000 },
      io,
      ...custom,
    });
  return { nodes, io, make };
}

it('sin ruta explícita o identidad POSIX verificable no toca el filesystem', async () => {
  const f = fixture();
  for (const custom of [
    { directory: '' },
    { directory: 'relative' },
    { identity: { platform: 'win32', uid: 1000 } },
    { identity: { platform: 'linux', uid: undefined } },
  ]) {
    const log = f.make(custom);
    log(record);
    await log.flush();
  }
  expect(f.io.realpath).not.toHaveBeenCalled();
  expect(f.io.open).not.toHaveBeenCalled();
});

it.each([
  resolve(applicationRoot, 'dist/client'),
  resolve('/account/public_html'),
  resolve('/account/www/logs'),
])('rechaza ubicación pública o dentro de la aplicación: %s', async (unsafe) => {
  const f = fixture(),
    log = f.make({ directory: unsafe });
  log(record);
  await log.flush();
  expect(f.io.open).not.toHaveBeenCalled();
});

it('rechaza rutas con alias/symlinks y padres modificables por terceros', async () => {
  const f = fixture();
  vi.mocked(f.io.realpath).mockImplementation(async (path) =>
    path === directory ? resolve('/another-location') : path,
  );
  let log = f.make();
  log(record);
  await log.flush();
  expect(f.io.open).not.toHaveBeenCalled();
  vi.mocked(f.io.realpath).mockImplementation(async (path) => path);
  f.nodes.get(dirname(directory))!.mode = 0o777;
  log = f.make();
  log(record);
  await log.flush();
  expect(f.io.open).not.toHaveBeenCalled();
});

it.each(['permissions', 'owner', 'missing', 'symlink'])(
  'falla cerrado ante directorio inseguro: %s',
  async (kind) => {
    const f = fixture();
    if (kind === 'permissions') f.nodes.get(directory)!.mode = 0o755;
    if (kind === 'owner') f.nodes.get(directory)!.uid = 2000;
    if (kind === 'missing') f.nodes.delete(directory);
    if (kind === 'symlink') f.nodes.get(directory)!.kind = 'symlink';
    const log = f.make();
    log(record);
    await log.flush();
    expect(f.io.open).not.toHaveBeenCalled();
  },
);

it('escribe JSONL 0600 con fecha y conserva registros al recrear el escritor', async () => {
  const f = fixture();
  let log = f.make();
  log(record);
  await log.flush();
  expect(f.nodes.get(filePath)!.mode).toBe(0o600);
  expect(JSON.parse(f.nodes.get(filePath)!.content)).toMatchObject(record);
  expect(JSON.parse(f.nodes.get(filePath)!.content).recorded_at).toMatch(/^\d{4}-/);
  expect(f.nodes.has(lockPath)).toBe(false);
  log = f.make();
  log(record);
  await log.flush();
  expect(f.nodes.get(filePath)!.content.trim().split('\n')).toHaveLength(2);
});

it.each(['permissions', 'owner', 'hardlink', 'symlink', 'full'])(
  'no modifica un archivo existente inseguro o lleno: %s',
  async (kind) => {
    const f = fixture();
    f.nodes.set(filePath, {
      kind: kind === 'symlink' ? 'symlink' : 'file',
      uid: kind === 'owner' ? 2000 : 1000,
      mode: kind === 'permissions' ? 0o644 : 0o600,
      nlink: kind === 'hardlink' ? 2 : 1,
      content: kind === 'full' ? 'x'.repeat(diagnosticFileLimit) : 'untouched',
    });
    const before = f.nodes.get(filePath)!.content;
    const log = f.make();
    log(record);
    await log.flush();
    expect(f.nodes.get(filePath)!.content).toBe(before);
    expect(f.nodes.has(lockPath)).toBe(false);
  },
);

it('archivo fijo queda acotado entre reinicios sin truncar o rotar información', async () => {
  const f = fixture();
  for (let i = 0; i < 90; i++) {
    const log = f.make();
    log({ ...record, padding: 'x'.repeat(1000) });
    await log.flush();
  }
  expect(Buffer.byteLength(f.nodes.get(filePath)!.content)).toBeLessThanOrEqual(
    diagnosticFileLimit,
  );
  expect([...f.nodes.keys()].filter((p) => f.nodes.get(p)?.kind === 'file')).toEqual([filePath]);
});

it('lock de otro escritor o residual no se elimina ni permite una escritura', async () => {
  const f = fixture();
  f.nodes.set(lockPath, { kind: 'file', uid: 1000, mode: 0o600, nlink: 1, content: '' });
  const log = f.make();
  log(record);
  await log.flush();
  expect(f.nodes.has(filePath)).toBe(false);
  expect(f.nodes.has(lockPath)).toBe(true);
  expect(f.io.unlink).not.toHaveBeenCalled();
});

it('fallo asíncrono se absorbe, sin stdout/stderr y sin nuevos intentos', async () => {
  const f = fixture();
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(f.io.open).mockRejectedValue(new Error('private-path-and-error'));
  const log = f.make();
  expect(() => log(record)).not.toThrow();
  await expect(log.flush()).resolves.toBeUndefined();
  const attempts = vi.mocked(f.io.open).mock.calls.length;
  log(record);
  await log.flush();
  expect(f.io.open).toHaveBeenCalledTimes(attempts);
  expect(info).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
