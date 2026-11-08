// Standalone synthetic visual fixture. No Google, business data or DB writes.
import { createServer } from 'node:http';
import { bindingPage } from '../../server/binding-http';
const stages = ['start', 'confirm', 'pending', 'error', 'disabled'] as const;
const port = Number(process.argv[2] || 5173);
createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost:5173');
  const stage = stages.find((s) => s === url.searchParams.get('stage')) || 'start';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(bindingPage('a'.repeat(64), req.method === 'POST' ? 'error' : stage, 'ab'.repeat(32)));
}).listen(port, '127.0.0.1', () => console.log('Synthetic binding QA: http://localhost:' + port));
