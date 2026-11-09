'use strict';

const PDFDocument = require('pdfkit');

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function createReportPdf(result, images, check = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: 'A4',
      compress: false,
      info: { Title: 'PhishGuard Dynamic Analysis Report' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const write = (title, value) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#142820').text(title);
      doc.font('Helvetica').fontSize(9).fillColor('#3f4a43').text(value || 'Not reported', { width: 495 });
      doc.moveDown(0.7);
    };

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#142820').text('PhishGuard Dynamic Analysis');
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(9).fillColor('#68756d').text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();

    write('URL host', check.host || 'Not reported');
    write('Rule-based score', `${check.ruleScore ?? 'n/a'}/100`);
    write('Overall PhishGuard score', `${check.score ?? 'n/a'}/100 (${check.verdict || 'Unrated'})`);
    const ruleSignals = Array.isArray(check.signals)
      ? check.signals.filter((signal) => signal.source !== 'ai' && signal.source !== 'system')
      : [];
    if (ruleSignals.length) {
      write('Rule findings', ruleSignals
        .map((signal) => `${signal.name || 'Finding'} (+${signal.points || 0}): ${signal.detail || ''}`)
        .join('\n'));
    }

    const verdict = result.verdict || {};
    write('Sandbox verdict', `${verdict.label || 'Unrated'} (${verdict.score ?? 'n/a'}/${verdict.max_score ?? 'n/a'})`);
    write('Submitted URL', result.submitted_url);
    write('Final URL', result.final_url);
    write('Analysis window', `${result.started_at || 'Unknown'} to ${result.finished_at || 'Unknown'} (${result.duration_seconds ?? 'n/a'} seconds)`);
    write('Reasons', Array.isArray(verdict.reasons) ? verdict.reasons.join(', ') : 'Not reported');

    const navigation = result.navigation || {};
    write('Navigation', `${navigation.hop_count ?? 0} redirects; ${navigation.hosts_contacted ?? 0} hosts contacted`);
    write('Redirect chain', Array.isArray(navigation.redirect_chain) ? navigation.redirect_chain.join('\n') : 'Not reported');

    const metrics = result.network_metrics || {};
    write('Requests by type', Object.entries(metrics.requests_by_type || {})
      .map(([type, count]) => `${type}: ${count}`).join(' | ') || 'Not reported');
    write('Top contacted hosts', Array.isArray(metrics.top_hosts)
      ? metrics.top_hosts.map((item) => `${item.host} (${item.requests} requests)`).join('\n')
      : 'Not reported');

    const requestTypes = Object.entries(metrics.requests_by_type || {}).slice(0, 10);
    if (requestTypes.length) {
      if (doc.y + requestTypes.length * 22 + 40 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#142820').text('Requests by resource type');
      const max = Math.max(1, ...requestTypes.map(([, count]) => safeNumber(count) || 0));
      const labelX = 52;
      const barX = 140;
      const barWidth = 390;
      let chartY = doc.y + 8;
      for (const [type, count] of requestTypes) {
        const numericCount = safeNumber(count) || 0;
        doc.font('Helvetica').fontSize(8).fillColor('#3f4a43').text(type, labelX, chartY, { width: 82 });
        doc.rect(barX, chartY, Math.max(2, (numericCount / max) * barWidth), 10).fill('#5b8267');
        doc.font('Helvetica').fontSize(8).fillColor('#3f4a43').text(String(numericCount), barX + barWidth + 6, chartY, { width: 30 });
        chartY += 20;
      }
      doc.y = chartY + 10;
    }

    const timeline = Array.isArray(metrics.timeline) ? metrics.timeline.slice(0, 40) : [];
    if (timeline.length) {
      if (doc.y + 130 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#142820').text('Network request timeline');
      const chartX = 52;
      const chartY = doc.y + 8;
      const chartWidth = 490;
      const chartHeight = 95;
      const max = Math.max(1, ...timeline.map((item) => item.cumulative_requests));
      doc.save().lineWidth(0.5).strokeColor('#d8d9cf')
        .moveTo(chartX, chartY + chartHeight).lineTo(chartX + chartWidth, chartY + chartHeight).stroke();
      const step = chartWidth / Math.max(1, timeline.length);
      timeline.forEach((point, index) => {
        const height = Math.max(2, (point.cumulative_requests / max) * chartHeight);
        doc.rect(chartX + index * step, chartY + chartHeight - height, Math.max(1, step - 1), height)
          .fill('#fb4c00');
      });
      doc.restore();
      doc.y = chartY + chartHeight + 20;
      doc.font('Helvetica').fontSize(8).fillColor('#68756d')
        .text(`0s to ${timeline[timeline.length - 1].t}s; ${max} requests`, chartX, doc.y);
      doc.moveDown();
    }

    for (const [index, screenshot] of (result.screenshots || []).entries()) {
      const image = images[index];
      if (!image) continue;
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#142820')
        .text(`Screenshot ${index + 1}: ${screenshot.stage}`);
      doc.moveDown();
      doc.image(image, { fit: [495, 650], align: 'center', valign: 'center' });
      doc.moveDown();
      doc.font('Helvetica').fontSize(8).fillColor('#68756d').text(screenshot.url);
    }

    doc.end();
  });
}

module.exports = { createReportPdf };
