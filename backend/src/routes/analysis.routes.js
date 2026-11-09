'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getJobForUser, getJobsForUser, getReportForUser } = require('../services/analysis.service');

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const jobs = getJobsForUser(req.user.id).map((job) => ({
    id: job.id,
    checkId: job.check_id,
    host: job.host,
    score: job.score,
    verdict: job.verdict,
    status: job.status,
    hasReport: Boolean(job.has_report),
    deliveries: JSON.parse(job.delivery_status || '{}'),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }));
  res.json({ jobs });
}));

router.get('/:jobId', requireAuth, asyncHandler(async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isSafeInteger(jobId) || jobId < 1) {
    return res.status(400).json({ error: 'Invalid analysis job identifier.' });
  }
  const job = getJobForUser(jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Analysis job not found.' });

  res.json({
    id: job.id,
    checkId: job.check_id,
    host: job.host,
    ruleScore: job.rule_score,
    score: job.score,
    verdict: job.verdict,
    signals: JSON.parse(job.signals || '[]'),
    status: job.status,
    error: job.error,
    hasReport: Boolean(job.has_report),
    deliveries: JSON.parse(job.delivery_status || '{}'),
    result: job.result_json ? JSON.parse(job.result_json) : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
}));

router.get('/:jobId/report.pdf', requireAuth, asyncHandler(async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isSafeInteger(jobId) || jobId < 1) {
    return res.status(400).json({ error: 'Invalid analysis job identifier.' });
  }
  const report = getReportForUser(jobId, req.user.id);
  if (!report || !report.report_pdf) {
    return res.status(404).json({ error: 'The analysis report is not ready.' });
  }

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="phishguard-report-${jobId}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(report.report_pdf);
}));

module.exports = router;
