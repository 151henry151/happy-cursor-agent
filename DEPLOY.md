# Happy Cursor Agent - Deploy on this server

This repo is a **git submodule** of [my-webserver-setup](https://github.com/151henry151/my-webserver-setup) at `happy-cursor-agent/` (on romptele: `/home/henry/webserver/happy-cursor-agent`). Clone the parent repo with `git clone --recurse-submodules` or run `git submodule update --init happy-cursor-agent` after clone.

## 1. Start the backend

```bash
cd /home/henry/webserver/happy-cursor-agent
docker compose up -d
```

Backend is published as **127.0.0.1:3007** → container port `3005` (see `docker-compose.yml`). Check: `curl -s http://127.0.0.1:3007/health`

## 2. Build web app

```bash
EXPO_PUBLIC_HAPPY_SERVER_URL=https://your-domain.com ./scripts/build-webapp.sh
```

Output is in `webapp-dist/`. Nginx vhost for production is in the parent repo: `../nginx/conf.d/p.romptele.com.conf` (see also `happy-cursor.romptele.com.conf.disabled`).

## 3. Production

Set `HANDY_MASTER_SECRET` in `.env` to a long random string (required for JWT-style tokens; do not use the compose default in production). Enable the nginx config after getting an SSL cert for your domain.

## Memory / OOM on a shared VPS

The stack shares the host with Nginx, databases, Jellyfin, Cursor remote (`~/.cursor-server`), etc. If the host runs out of RAM, the kernel OOM killer can terminate unrelated services.

- **Compose limits:** `docker-compose.yml` sets `mem_limit` / `NODE_OPTIONS` on `happy-server`, `happy-db`, and `happy-redis` so this app cannot consume the entire machine. After changing limits, run `docker compose up -d` again.
- **Object storage:** If `S3_HOST` is set, `loadFiles()` checks the bucket at startup; wrong credentials or a missing bucket prevent the API from starting—check `docker compose logs happy-server`.
- **Without S3:** Omit `S3_HOST` to use local `./data/files` inside the container (fine for small installs).
- **“Create account” / server error:** From the server, `curl -sS -X POST http://127.0.0.1:3007/v1/auth ...` with valid crypto bodies is awkward; easier: read logs (`docker compose logs -f happy-server`) while reproducing in the browser, and confirm Postgres is healthy (`docker compose ps`).

See also `docs/deployment.md` for required env vars.
