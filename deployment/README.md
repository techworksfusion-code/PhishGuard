# Deployment

Target environment (from `System_Design.md` §7): **Arch Linux VPS**, Node.js + Express managed by **PM2**, traffic reaching the server through a **Cloudflare Tunnel** so no inbound ports are open.

## 1. Install server dependencies (Arch Linux)

```bash
sudo pacman -S nodejs npm cloudflared
npm install -g pm2
```

## 2. Run the API with PM2

```bash
cd /opt/phishguard/backend
npm install express cors express-rate-limit dotenv @google/genai
echo "GEMINI_API_KEY=your_key"   >> .env
echo "GEMINI_MODEL=current_flash_model_name" >> .env
pm2 start ../deployment/pm2/ecosystem.config.js
pm2 save && pm2 startup          # restart on reboot
```

The sample process file is [`pm2/ecosystem.config.js`](pm2/ecosystem.config.js).

## 3. Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create phishguard
cloudflared tunnel route dns phishguard api.yourdomain.com
sudo cloudflared service install
```

Point the tunnel at the local API with [`cloudflare/config.yml`](cloudflare/config.yml):

```yaml
tunnel: 7bc9a812-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: /root/.cloudflared/7bc9a812-xxxx.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:5000
  - service: http_status:404
```

Replace the tunnel ID and credentials file with the values printed by `cloudflared tunnel create`. Cloudflare terminates TLS; the VPS never exposes a firewall port.

## 4. Verify

```bash
pm2 status                       # API online
pm2 logs phishguard-api          # request logs
curl -s -X POST https://api.yourdomain.com/api/check-link \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://free-recharge-jio.xyz/claim"}' | head
```

## Notes

- `gemini-1.5-flash` is retired; confirm the current Flash model name at [ai.google.dev](https://ai.google.dev) and set `GEMINI_MODEL` accordingly.
- Update the frontend (`frontend/.env.local` → `VITE_API_URL=https://api.yourdomain.com`, `VITE_DEMO_MODE=false`) before the production build.
- Threat history is persisted in SQLite (`checks` table), subject to the retention policy in `BACKEND_DESIGN.md` §2.4.
