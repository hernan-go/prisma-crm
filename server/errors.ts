export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function requireFound(value: unknown) {
  if (!value) throw new AppError(404, 'No se encontró el registro.');
}
