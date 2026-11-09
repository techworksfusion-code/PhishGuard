'use strict';

const Router = require('express').Router;
const healthRoutes = require('./health.routes');
const checkLinkRouter = require('./checks.routes.checkLink');
const historyRouter = require('./checks.routes.history');
const linksRouter = require('./links.routes');
const scanRouter = require('./scan.routes');
const alertsRouter = require('./alerts.routes');
const analysisRouter = require('./analysis.routes');
const integrationsRouter = require('./integrations.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/check-link', checkLinkRouter);
router.use('/history', historyRouter);
router.use('/links', linksRouter);
router.use('/scan-message', scanRouter);
router.use('/alerts', alertsRouter);
router.use('/analysis', analysisRouter);
router.use('/integrations', integrationsRouter);

module.exports = router;
