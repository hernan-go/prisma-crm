import { emitKeypressEvents } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth.js';
import { pool } from '../server/db.js';
async function hidden(label: string) {
  if (!process.stdin.isTTY)
    throw new Error(
      'Ejecutá este comando en una terminal interactiva. No pases la contraseña como argumento.',
    );
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const done = () => {
      process.stdin.off('keypress', listener);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const listener = (text: string, key: any) => {
      if (key?.ctrl && key.name === 'c') {
        done();
        reject(new Error('Cancelado.'));
        return;
      }
      if (key?.name === 'return') {
        done();
        resolve(value);
        return;
      }
      if (key?.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (text && !key?.ctrl && ![...text].some((c) => c.charCodeAt(0) < 32)) value += text;
    };
    process.stdin.on('keypress', listener);
  });
}
try {
  const password = await hidden('Contraseña compartida (mínimo 12 caracteres, entrada oculta): ');
  if (password.length < 12 || password.length > 1024)
    throw new Error('Usá entre 12 y 1024 caracteres.');
  if (password !== (await hidden('Repetir contraseña: '))) throw new Error('No coinciden.');
  const values = {
    ADMIN_PASSWORD_HASH: await hashPassword(password),
    SESSION_SECRET: randomBytes(48).toString('hex'),
  };
  if (process.argv.includes('--print')) {
    console.log('Copiá estas variables al panel privado del hosting, nunca a Git:');
    for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  } else {
    let env = await readFile('.env', 'utf8').catch(() => '');
    for (const [k, v] of Object.entries(values))
      env = env.replace(new RegExp(`^${k}=.*\\r?\\n?`, 'gm'), '') + `\n${k}=${v}\n`;
    await writeFile('.env', env, { mode: 0o600 });
    console.log(
      'Hash y secreto guardados en .env. Reiniciá el servidor. La contraseña no se guardó.',
    );
  }
} finally {
  await pool.end();
}
