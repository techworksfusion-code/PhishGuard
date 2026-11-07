'use strict';

const Router = require('express').Router;
const healthRoutes = require('./health.routes');

const router = Router();

router.use('/health', healthRoutes);

module.exports = router;
