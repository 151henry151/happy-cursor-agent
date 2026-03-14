# Happy Cursor Agent - Deploy on this server

## 1. Start the backend

```bash
cd /home/henry/happy-cursor-agent
docker compose up -d
```

Backend listens on **127.0.0.1:3006**. Check: `curl -s http://127.0.0.1:3006/health`

## 2. Build web app

```bash
EXPO_PUBLIC_HAPPY_SERVER_URL=https://your-domain.com ./scripts/build-webapp.sh
```

Output is in `webapp-dist/`. Nginx config is in `../webserver/nginx/conf.d/happy-cursor.romptele.com.conf` (disabled until SSL is ready).

## 3. Production

Set `HANDY_MASTER_SECRET` in `.env` to a long random string. Enable the nginx config after getting an SSL cert for your domain.
