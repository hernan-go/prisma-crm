import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { pool } from './db.js';
import { sessionDigest } from './identity.js';
import { expectedMember, parseTarget, pilotOperator, previewGrant } from './portal-operations.js';

export async function runPortalCli(args: string[]) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('TTY requerido.');
  const [command, ...destination] = args;
  const target = parseTarget(destination);
  const commands = [
    'h2-preview',
    'h2-apply',
    'status',
    'prepare',
    'seal-receipt',
    'enable',
    'close',
    'h1',
    'link-enable',
    'link-disable',
  ];
  if (!commands.includes(command)) throw Error('Comando inválido.');
  let privateInput = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!privateInput) process.stdout.write(chunk);
      done();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
    historySize: 0,
  });
  const abort = new AbortController();
  terminal.on('SIGINT', () => abort.abort());
  const question = (label: string) => terminal.question(label + ' > ', { signal: abort.signal });
  async function secret(label: string) {
    process.stdout.write(label + ' (sin eco) > ');
    privateInput = true;
    try {
      return await terminal.question('', { signal: abort.signal });
    } finally {
      privateInput = false;
      process.stdout.write('\n');
    }
  }
  async function member() {
    return expectedMember.parse({
      userId: await question('UUID institucional'),
      instructorId: Number(await question('ID de instructor')),
      subject: await secret('Google sub exacto'),
    });
  }
  async function confirm(action: string) {
    const phrase = action + ' ' + target.database;
    if ((await question('Escriba ' + phrase)) !== phrase) throw Error('Cancelado.');
  }
  try {
    if (command.startsWith('h2-')) {
      const preview = await previewGrant(target, await member());
      console.log({
        target,
        userId: preview.userId,
        instructorId: preview.instructorId,
        roles: preview.roles,
        grant: 'facilitator',
      });
      if (command === 'h2-apply')
        console.log(await preview.apply(await question('Escriba ' + preview.phrase)));
      return;
    }
    const userId = z
      .string()
      .uuid()
      .parse(await question('UUID administrador'));
    const sessionHash = sessionDigest(await secret('Sesión CRM individual'));
    if (!sessionHash) throw Error('Credencial inválida.');
    const context = { userId, sessionHash };
    const key =
      command === 'prepare'
        ? Buffer.from(
            z
              .string()
              .regex(/^(?:[a-f0-9]{2}){32,}$/)
              .parse(await secret('Clave privada de preparación (hex)')),
            'hex',
          )
        : randomBytes(32);
    const pairs =
      command === 'prepare' || command === 'enable' || command === 'seal-receipt'
        ? [await member(), await member()]
        : command === 'link-enable'
          ? [await member()]
          : [];
    const service = pilotOperator(target, key, pairs);
    const status = await service.status(context);
    console.log(status);
    if (command === 'status') return;
    if (command === 'seal-receipt') {
      const operationId = await question('UUID original del sellado');
      const revision = await question('Revisión original del plan');
      console.log(
        await service.recoverSeal(
          context,
          operationId,
          revision,
          pairs.map(({ userId, instructorId }) => ({ userId, instructorId })),
        ),
      );
      return;
    }
    if (command === 'prepare') {
      const plan = await service.preparePilot(
        context,
        pairs.map(({ userId, instructorId }) => ({ userId, instructorId })),
      );
      console.log({
        members: plan.plan.members,
        revision: plan.plan.revision,
        expiresAt: plan.plan.expiresAt,
      });
      if ((await question('Acción posterior (seal o salir)')) !== 'seal') return;
      const operationId = z
        .string()
        .uuid()
        .parse(await question('UUID operación seal'));
      await confirm('SELLAR ' + operationId);
      console.log(await service.sealPilot(context, operationId, plan));
      return;
    }
    const operationId = z
      .string()
      .uuid()
      .parse(await question('UUID operación (original para reintento)'));
    const expectedRevision = await question('Revisión global esperada (original para reintento)');
    const base = { operationId, expectedRevision };
    if (command === 'enable' || command === 'close') {
      await confirm(command + ' ' + operationId + ' ' + expectedRevision);
      console.log(
        await service.setPortalEnabled(context, { ...base, enabled: command === 'enable' }),
      );
    } else {
      const userId = pairs[0]?.userId ?? (await question('UUID del vínculo'));
      const expectedLinkRevision = await question('Revisión del vínculo esperada');
      await confirm(command + ' ' + operationId + ' ' + userId + ' ' + expectedLinkRevision);
      const link = { ...base, userId, expectedLinkRevision };
      console.log(
        command === 'h1'
          ? await service.revokePortalSessions(context, link)
          : await service.setLinkEnabled(context, { ...link, enabled: command === 'link-enable' }),
      );
    }
  } finally {
    terminal.close();
    output.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runPortalCli(process.argv.slice(2));
  } catch {
    console.error(
      'Operación cancelada o rechazada. Verifique destino, precondiciones y estado antes de reintentar.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
