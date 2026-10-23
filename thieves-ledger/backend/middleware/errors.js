class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sendError = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

const notFound = (req, res) => sendError(res, 404, 'NOT_FOUND', 'Route not found.');

// Express error handler. It deliberately never echoes err.message or err.body for
// parser errors: a JSON syntax error message can contain a snippet of the request
// body, which might be a password.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message, err.details);
  if (err && err.type === 'entity.parse.failed')
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  if (err && err.type === 'entity.too.large')
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  console.error(`Unhandled error: ${err && err.name ? err.name : 'Error'} on ${req.method} ${req.path}`);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong inside the vault.');
};

module.exports = { ApiError, sendError, notFound, errorHandler };
