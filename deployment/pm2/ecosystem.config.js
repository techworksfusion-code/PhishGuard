// PM2 process file for PhishGuard on this machine (served through Cloudflare Tunnel).
// Start with: pm2 start ecosystem.config.js && pm2 save
// Persist across reboot:  pm2-startup install (via pm2-windows-startup)

module.exports = {
  apps: [
    {
      name: 'phishguard-api',
      script: 'src/server.js',
      cwd: __dirname + '/../../backend',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    },
    {
      name: 'phishguard-web',
      // Static server for the production build (frontend/dist).
      script: 'server.cjs',
      cwd: __dirname + '/../../frontend',
      instances: 1,
      autorestart: true,
      env: {
        WEB_PORT: 8080
      }
    },
    {
      name: 'phishguard-retention',
      // One-shot purge (BACKEND_DESIGN.md §2.4), re-run by cron every 6 h.
      script: 'scripts/retention.js',
      cwd: __dirname + '/../../backend',
      autorestart: false,
      cron_restart: '7 */6 * * *'
    }
  ]
};
