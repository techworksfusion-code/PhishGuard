import { HttpError } from '../utils/httpError.js';

export function requireAuth(_req, _res, next) {
  return next(new HttpError(401, 'Authentication is required.'));
}

export function optionalAuth(req, _res, next) {
  req.user = null;
  return next();
}
