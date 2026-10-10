# Server deployment

Dashboard is deployed separately in `/opt/dashboard` on `2.28.115.50`.
The public address is `https://gayboyz.lol` (DNS and HTTPS verified).
The existing La Rose Caddy container handles HTTPS for both projects.

## Configuration

Create an untracked `/opt/dashboard/.env` containing:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml
COMPOSE_PROJECT_NAME=dashboard
PUBLIC_DOMAIN=gayboyz.lol
EDGE_NETWORK=la-rose_edge
```

GitHub OAuth credentials are optional; add `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` to enable GitHub login and widgets. Register the callback
`https://gayboyz.lol/auth/github/callback` in your GitHub OAuth application.
Production sets secure cookies explicitly; local HTTP development is unchanged.

## Start or update

From `/opt/dashboard`, after copying the updated application files:

```bash
docker compose up -d --wait --wait-timeout 120
```

This builds both images, starts the API and frontend, and waits for their health
checks. Keep `.env` and the `dashboard_dashboard-data` volume during updates.
Only the existing Caddy service publishes ports 80/443; Dashboard publishes no
host ports. Its frontend joins `la-rose_edge` with the name `dashboard-web`.

## Domain and HTTPS

At Porkbun, point the root domain's A record to `2.28.115.50` (leave Host blank).
Replace any root parking ALIAS/A record; preserve unrelated mail and TXT records.
Append `docker/Caddyfile.dashboard` to the existing Caddyfile after saving a backup,
then validate and gracefully reload Caddy. Caddy obtains and renews HTTPS
certificates after the domain points to this server.

```bash
docker exec la-rose-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec la-rose-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Check and stop

```bash
curl --fail https://gayboyz.lol/health
docker compose ps
docker compose logs --tail=100
docker compose down
```

Stopping Dashboard does not stop La Rose and does not remove saved accounts.
Avoid `down -v` unless deleting all Dashboard data is intentional.

## Verification on 2026-10-10

Both production images built successfully on the server, and both containers
became healthy. HTML, JavaScript, CSS, database health, the service catalogue,
secure logout cookies and unauthenticated API protection passed live checks.
The existing La Rose HTTPS endpoint remained reachable (302 redirect).
The root domain resolves to `2.28.115.50`. Public HTTPS returned 200 for the
homepage, `/health` confirmed the database connection, and the sign-in page
opened successfully in a browser without console warnings or errors. Caddy
manages certificate renewal automatically.
