export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any,
  ) {
    super(message);
  }
}
export function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await r.json();
  if (r.status === 401 && !path.startsWith('/auth/'))
    window.dispatchEvent(new Event('session-expired'));
  if (!r.ok)
    throw new ApiError(
      data.message || 'No se pudo completar la operación.',
      r.status,
      data.details,
    );
  return data;
}
