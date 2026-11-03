// PM2 process file for the PhishGuard Express API (sample).
// Start with: pm2 start ecosystem.config.js
// Persist after reboot: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'phishguard-api',
      script: 'src/server.js',
      cwd: __dirname + '/../../backend',
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
        // GEMINI_API_KEY and GEMINI_MODEL are read from backend/.env
      }
    }
  ]
};
