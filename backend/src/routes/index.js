'use strict';

const Router = require('express').Router;
const healthRoutes = require('./health.routes');
const checkLinkRouter = require('./checks.routes.checkLink');
const historyRouter = require('./checks.routes.history');
const linksRouter = require('./links.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/check-link', checkLinkRouter);
router.use('/history', historyRouter);
router.use('/links', linksRouter);

module.exports = router;
