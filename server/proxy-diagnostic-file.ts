import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const diagnosticFileName = 'proxy-diagnostics.jsonl';
export const diagnosticFileLimit = 64 * 1024;
const lockName = 'proxy-diagnostics.lock';
interface Entry {
  uid: number;
  mode: number;
  nlink: number;
  size: number;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}
interface Handle {
  stat(): Promise<Entry>;
  writeFile(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface DiagnosticFileIO {
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<Entry>;
  open(path: string, flags: number, mode?: number): Promise<Handle>;
  unlink(path: string): Promise<void>;
}
const inside = (child: string, parent: string) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

// No default location: an operator must first establish a private, writable POSIX
// directory outside the application and web roots. Windows cannot prove 0700 ACLs.
export function createPrivateDiagnosticLog(
  options: {
    directory?: string;
    applicationRoot?: string;
    io?: DiagnosticFileIO;
    identity?: { platform: string; uid: number | undefined };
  } = {},
) {
  const directory = options.directory ?? process.env.PROXY_DIAGNOSTICS_DIR ?? '';
  const applicationRoot = options.applicationRoot ?? process.cwd();
  const identity = options.identity ?? { platform: process.platform, uid: process.getuid?.() };
  const io: DiagnosticFileIO = options.io ?? fs;
  let pending = Promise.resolve();
  let failed = false;
  const configured =
    identity.platform === 'linux' && identity.uid !== undefined && isAbsolute(directory);
  const owned = (entry: Entry, mode: number) =>
    entry.uid === identity.uid && (entry.mode & 0o777) === mode;
  const regular = (entry: Entry) =>
    entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1 && owned(entry, 0o600);

  async function append(record: Record<string, unknown>) {
    const target = await io.realpath(directory);
    const root = await io.realpath(applicationRoot);
    if (
      target !== resolve(directory) ||
      inside(target, root) ||
      inside(root, target) ||
      target
        .split(/[\\/]/)
        .some((part) => /^(public_html|public|www|wwwroot|htdocs|dist)$/i.test(part))
    )
      throw Error('Unsafe diagnostic directory');
    const entry = await io.lstat(target);
    if (!entry.isDirectory() || entry.isSymbolicLink() || !owned(entry, 0o700))
      throw Error('Private diagnostic directory required');
    // A writable parent could let another user replace the directory between
    // validation and open. Accept only root/own parents without group/world write.
    for (let parent = dirname(target); ; parent = dirname(parent)) {
      const stat = await io.lstat(parent);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o022) !== 0 ||
        (stat.uid !== 0 && stat.uid !== identity.uid)
      )
        throw Error('Unsafe diagnostic parent');
      if (parent === dirname(parent)) break;
    }
    const line = JSON.stringify({ ...record, recorded_at: new Date().toISOString() }) + '\n';
    const length = Buffer.byteLength(line);
    if (length > 2048) throw Error('Diagnostic record too large');
    const lockPath = resolve(target, lockName);
    const filePath = resolve(target, diagnosticFileName);
    let lock: Handle | undefined;
    let file: Handle | undefined;
    try {
      // Exclusive lock bounds the fixed file across processes/restarts. A stale
      // lock fails closed and is removed manually only after stopping diagnostics.
      lock = await io.open(
        lockPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      if (!regular(await lock.stat())) throw Error('Unsafe diagnostic lock');
      try {
        file = await io.open(
          filePath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
          throw error;
        file = await io.open(
          filePath,
          constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      }
      const stat = await file.stat();
      if (!regular(stat) || stat.size + length > diagnosticFileLimit)
        throw Error('Unsafe or full diagnostic file');
      await file.writeFile(line);
    } finally {
      if (file) await file.close().catch(() => {});
      if (lock) {
        await lock.close().catch(() => {});
        await io.unlink(lockPath).catch(() => {});
      }
    }
  }

  const log = (record: Record<string, unknown>) => {
    if (!configured || failed) return;
    // Never await filesystem access in the request handler; a failure disables
    // this sink without printing paths, records, credentials or underlying errors.
    pending = pending
      .then(async () => {
        if (!failed) await append(record);
      })
      .catch(() => {
        failed = true;
      });
  };
  return Object.assign(log, { flush: () => pending });
}
