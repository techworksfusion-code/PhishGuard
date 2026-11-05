export function errorHandler(logger = console) {
  return (error, _req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }

    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    if (status === 500) {
      logger.error('Unhandled API error.', error);
    }

    const message = status === 500
      ? 'An unexpected error occurred.'
      : error.message;
    return res.status(status).json({ error: message });
  };
}
