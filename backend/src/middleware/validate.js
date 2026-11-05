import { HttpError } from '../utils/httpError.js';

export function requireJsonObject(req, _res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new HttpError(400, 'Request body must be a JSON object.'));
  }
  return next();
}
