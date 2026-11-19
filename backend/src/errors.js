export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const badRequest = (message, fields) => new HttpError(400, 'VALIDATION', message, fields ? { fields } : undefined);
export const unauthorized = (message = 'Please sign in') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to do this') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large' } });
  }
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large. The limit is 10 MB.' : `Upload rejected: ${err.message}`;
    return res.status(400).json({ error: { code: err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'BAD_UPLOAD', message } });
  }
  if (err?.code === 'SQLITE_BUSY') {
    console.error('SQLITE_BUSY', err);
    return res.status(409).json({ error: { code: 'BUSY', message: 'The server is busy, please try again' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
