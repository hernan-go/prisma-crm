import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { bindingPage, bindingRouter } from '../server/binding-http.js';

describe('Google binding HTTP security regressions', () => {
  it('renders a valid UUID pattern for modern browsers', () => {
    const html = bindingPage('test-csrf', 'start');

    const pattern = html.match(
      /name="operationId"[^>]*pattern="([^"]+)"/,
    )?.[1];

    expect(pattern).toBeDefined();

    const regex = new RegExp(`^(?:${pattern})$`, 'v');

    expect(
      regex.test('123e4567-e89b-12d3-a456-426614174000'),
    ).toBe(true);

    expect(regex.test('invalid-uuid')).toBe(false);
  });

  it('preserves secure headers and permits Google authorization', async () => {
    const app = express();

    // Sin opciones OAuth, el router responde 503 sin acceder a MySQL.
    app.use(bindingRouter());

    const response = await request(app)
      .get('/vincular-google')
      .expect(503);

    expect(response.headers['referrer-policy']).toBe('same-origin');

    const csp = response.headers['content-security-policy'];

    expect(csp).toContain(
      "form-action 'self' https://accounts.google.com;",
    );

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});