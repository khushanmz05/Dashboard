# Dashboard

**Built by you. For you.**

A personal workspace for weather, GitHub activity and RSS feeds. Choose your
services, configure multiple widgets and give each one its own refresh interval.
Built for the **Epitech G-WEB-500 Dashboard project**, by a team of two.

[Quick start](#quick-start) · [GitHub setup](#github-setup) ·
[Widgets](#services-and-widgets) · [Tests](#testing) · [Status](#delivery-status)

## Features

- Registration, explicit account confirmation, sign-in and sign-out.
- Password login and GitHub OAuth login with account linking safeguards.
- Server-persisted service subscriptions and per-user dashboards.
- GitHub account connection, cancellation, disconnection and reconnection.
- Nine widget types across three services, with independent configurations.
- Add, edit, remove, filter and reorder widgets with drag handles or arrow buttons.
- Automatic per-widget refresh, manual refresh and refresh-all.
- Loading, empty, error and stale-data states, with recovery actions.
- Responsive desktop/mobile views, labelled controls, visible focus and native dialogs.

## Quick start

Use **Node.js 22 or 24**, npm and a modern browser. From the repository root:

```bash
npm ci
npm start
```

Open [http://localhost:8080](http://localhost:8080).
There is no separate frontend build step. The same Node server serves the UI
and API; SQLite is created automatically at `data/dashboard.sqlite`.
External widget updates need internet access. Weather and RSS need no API keys;
GitHub needs the OAuth configuration below.

1. Choose **Create account**. Usernames need at least 3 characters and passwords 8.
2. Click **Confirm account**. The current development server returns a code that
   the form fills in. **No confirmation email is sent.**
3. Sign in with your username and password.
4. Alternatively, choose **Continue with GitHub** on the login screen.
5. Open **Services**. Weather is available by default; enable RSS or GitHub.
6. For GitHub widgets, select **Connect GitHub** and authorize the account.
7. Add a widget, enter its parameters and choose a refresh interval.

The default interval is **5 minutes**, with a minimum of **10 seconds**.
Short intervals can exhaust provider rate limits. You can add several instances
of the same type, such as weather for two cities.

### GitHub setup

Configure a GitHub OAuth App with these local URLs:

| Setting                    | Value                                        |
| -------------------------- | -------------------------------------------- |
| Homepage URL               | `http://localhost:8080`                      |
| Authorization callback URL | `http://localhost:8080/auth/github/callback` |

Create an untracked `.env` in the project root with your application values:

```dotenv
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
```

For local Node development, load it explicitly:

```bash
node --env-file=.env server/index.js
```

`npm start` reads exported environment variables, but does not load `.env` by
itself. Restart the server after changing the configuration. Use the same host
and port in the browser, OAuth App and callback setting.

OAuth tokens stay on the server. The current scopes support **public repository
widgets**; connecting an account does not add private repository access.
Disconnection removes credentials and keeps widget configurations. The UI offers
reconnection when a GitHub token becomes invalid, without ending the Dashboard
session. Disabling a service requires removing its widgets first.

### Docker

Install and start Docker with the current Compose plugin (Docker Desktop with
Ubuntu WSL integration, or Docker Engine with Compose inside Ubuntu).
From the repository root, build and start the entire application:

```bash
docker compose up
```

Both services use `pull_policy: build`, so this command builds their images,
including after source changes. Unchanged build layers are cached. The explicit
`docker compose up --build` command works too. No local Node.js, npm install,
database setup or `.env` file is required. The first build needs internet access
to download base images, build tools and application dependencies.

Open [http://localhost:8080](http://localhost:8080). Compose installs backend
dependencies (including native SQLite support), initializes the database, waits
for the backend health check, then starts Nginx with the frontend. Port **8080**
must be available. The frontend proxies API, authentication, health and catalogue
requests to the internal backend. SQLite persists in the named `dashboard-data`
volume across container recreation. Services restart unless explicitly stopped.

To start in the background and wait for both services to become healthy:

```bash
docker compose up -d --wait
```

GitHub login and widgets additionally require your OAuth application credentials.
For those features, copy the template, fill in the GitHub values, then run
`docker compose up -d --wait` again:

```bash
cp .env.example .env
```

Username/password registration, weather and RSS work without GitHub credentials.
Compose automatically reads `.env`; it is never copied into an image.

Check service state or follow logs:

```bash
docker compose ps
docker compose logs -f
```

Stop the stack while preserving stored accounts and dashboards:

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete the
database volume and all Docker-managed dashboard data. Do not commit `.env`;
`.env.example` contains placeholders only.

### Check the server

```bash
curl http://localhost:8080/health
curl http://localhost:8080/about.json
```

`/health` checks the database. `/about.json` exposes the client IP, current Unix
timestamp and service/widget catalogue used to build the configuration forms.

## Services and widgets

| Service | Widget             | Parameters             | Displays                                  |
| ------- | ------------------ | ---------------------- | ----------------------------------------- |
| Weather | City temperature   | City                   | Current temperature in °C                 |
| Weather | Weather conditions | City                   | Current weather description               |
| Weather | Precipitation      | City                   | Current precipitation in mm               |
| GitHub  | Recent commits     | Repository, item count | Commit messages, authors and links        |
| GitHub  | Open issues        | Repository             | Open issue count, excluding pull requests |
| GitHub  | Repository stars   | Repository             | Star count                                |
| RSS     | Latest stories     | Feed URL, item count   | Article titles and links                  |
| RSS     | Feed article count | Feed URL               | Entries currently available in the feed   |
| RSS     | Latest article     | Feed URL               | First entry as ordered by the feed        |

Weather comes from Open-Meteo, GitHub from its REST API, and feeds are fetched
and parsed by the backend. The browser only requests the application's API;
feed-origin browser CORS permission is not needed. Feed format support depends
on the server parser. Item counts accept **1–20**.

For a GitHub commits widget, enter `facebook/react` (or
`https://github.com/facebook/react`), choose 5 items and a 5-minute interval.
The UI normalizes repository URLs to `owner/repository`. Enter a value yourself:
placeholder text is not submitted.

## Architecture

The browser manages views, forms, rendering and refresh schedules. The Node.js
server handles authentication, service subscriptions, OAuth and external data
requests. SQLite stores accounts, sessions, service credentials and widgets.

| Path                                     | Responsibility                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `public/index.html`                      | Pages, navigation, forms and dialogs                                        |
| `public/styles.css`                      | Visual design, responsive layout and focus styles                           |
| `public/app.js`                          | UI state, authentication, subscriptions, OAuth flow, widget CRUD and timers |
| `public/api.js`                          | Shared JSON requests, HTTP errors, timeouts and empty responses             |
| `public/data.js`                         | Validation and safe rendering of server-provided widget data                |
| `server/index.js`                        | Node HTTP routes, static files and service catalogue                        |
| `server/auth.js`                         | Accounts, verification and cookie sessions                                  |
| `server/providers.js`                    | External providers and structured widget data                               |
| `server/database.js`, `server/schema.js` | SQLite initialization and schema                                            |
| `tests/frontend.cjs`                     | Browser integration tests                                                   |
| `tests/widgets-api.cjs`                  | Widget API regression tests                                                 |
| `docs/`                                  | Guides, technology decisions and historical verification notes             |
| `examples/bootstrap/`                    | Standalone authentication, books API and weather exercises                  |
| `docker/`                                | Backend/frontend Dockerfiles and Nginx configuration                        |

No UI framework or bundler is required. SQLite uses `better-sqlite3`; browser
tests use Playwright, a development-only dependency. The original exercises live in `examples/bootstrap/` and run independently.
See [the bootstrap guide](docs/bootstrap.md) for their commands.

### Repository layout

```text
.
├── public/                  # Browser interface and static assets
├── server/                  # Application API, authentication and database
├── tests/                   # Browser and API regression tests
├── docker/                  # Container images and Nginx configuration
├── examples/
│   └── bootstrap/           # Original standalone exercises
│       ├── auth/
│       ├── books/
│       └── weather.js
├── docs/
│   ├── bootstrap.md         # Exercise setup and usage
│   ├── frontend.md          # Frontend implementation and handoff
│   ├── decisions/           # Decision matrix and original spreadsheet
│   └── verification/        # Historical exercise verification log
├── docker-compose.yml      # Start the complete container stack
├── package.json            # Dependencies and application/test commands
├── package-lock.json       # Locked dependency versions
├── .env.example            # Local configuration template
└── README.md
```

Run application, test and Compose commands from the repository root. Compose
uses the Dockerfiles in `docker/` with the repository root as its build context.
For individual images, use `docker build -f docker/Dockerfile .` or
`docker build -f docker/Dockerfile.frontend .` from the root.
Runtime data is generated in `data/` and is excluded from version control.

### Persistence and recovery

- Service preferences, widget settings and order are stored per account on the server.
- Session cookies are `HttpOnly` and `SameSite=Lax`; sessions last seven days.
- Confirmation codes are single-use and expire after 24 hours.
- Each widget has a separate timer and abortable request, with a 15-second UI timeout.
- Failed updates retain the last valid result and label it as stale.
- A GitHub authorization error offers reconnection and pauses that widget's timer.
- Session expiry closes dialogs, cancels requests/timers and returns to sign-in.
- Reordering saves individual positions; the backend has no atomic bulk reorder.

## API overview

| Method         | Endpoint                     | Purpose                                      |
| -------------- | ---------------------------- | -------------------------------------------- |
| GET            | `/health`                    | Database health                              |
| GET            | `/about.json`                | Service/widget catalogue                     |
| POST           | `/auth/register`             | Create an unconfirmed account                |
| POST           | `/auth/verify`               | Confirm a registration code                  |
| POST           | `/auth/login`                | Start a session                              |
| GET            | `/auth/github/login`         | Start a GitHub login flow                    |
| POST           | `/auth/logout`               | End a session                                |
| GET            | `/api/me`                    | Current user                                 |
| GET            | `/api/services`              | Current subscriptions                        |
| POST           | `/api/services/:name/enable` | Enable a service                             |
| DELETE         | `/api/services/:name`        | Disable an unused service                    |
| GET            | `/api/github`                | GitHub connection status                     |
| GET            | `/auth/github/connect`       | Obtain an OAuth authorization URL            |
| GET            | `/auth/github/callback`      | Complete OAuth                               |
| DELETE         | `/api/github`                | Remove GitHub credentials                    |
| GET / POST     | `/api/widgets`               | List / create widgets                        |
| PATCH / DELETE | `/api/widgets/:id`           | Update / remove a widget                     |
| GET            | `/api/widgets/:id/data`      | Structured data from its saved configuration |

All `/api/` routes require a session. JSON bodies are used where applicable;
widget deletion returns an empty HTTP 204. Backend validation enforces widget
parameters, subscriptions and ownership. RSS requests have internal-address,
response-size, timeout and redirect protections.

## Configuration

| Variable               | Default                      | Purpose                               |
| ---------------------- | ---------------------------- | ------------------------------------- |
| `PORT`                 | `8080`                       | Local server port                     |
| `GITHUB_CLIENT_ID`     | Unset                        | OAuth App client ID                   |
| `GITHUB_CLIENT_SECRET` | Unset                        | OAuth App secret                      |
| `GITHUB_CALLBACK_URL`  | Derived from request host    | Explicit OAuth callback URL           |
| `TEST_PORT`            | `8187` frontend / `8188` API | Isolated test server port             |
| `CHROMIUM_PATH`        | Unset                        | Optional existing Chromium executable |
| `SCREENSHOT_DIR`       | Unset                        | Optional frontend test screenshots    |

For example, `PORT=8081 npm start` changes the local port. The supplied Docker
Compose configuration uses port 8080. Never commit `.env`, credentials, generated
databases, local account files or `node_modules`.

## Testing

```bash
npm ci
npx playwright install chromium
npm run test:frontend
npm run test:widgets-api
```

If Chromium needs Linux system dependencies, use
`npx playwright install --with-deps chromium`.

Both suites start isolated servers and temporary databases; do not start the
app for them. Your normal accounts and widgets are untouched. The frontend
suite tests real authentication, subscriptions, OAuth routes and widget CRUD.
GitHub authorization, token/profile responses and widget data use controlled
fixtures; no real keys or external provider access are needed.

Coverage includes expired/invalid confirmation codes, confirmation links,
subscription persistence and conflicts, OAuth cancellation/success, GitHub
reconnection, all nine renderers, unsafe content, malformed data, independent
timers, stale data, ordering, editing/deletion, mobile layout and session expiry.
See [the verification notes](docs/frontend.md) for scope and limitations.

## Delivery status

| Area                                               | Status                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frontend integration with existing APIs            | Implemented and covered by browser tests                                                  |
| Server subscriptions, widget data and GitHub OAuth | Present in the supplied backend and integrated into the UI                                |
| Account confirmation                               | Code entry and `/?verify_token=...` links work; email delivery and resend API are missing |
| Live provider / OAuth credentials                  | Must be checked with the team's environment before the demo                               |
| Docker startup                                     | Automatic Compose build/start configured; current images require verification on a Docker host |
| Lighthouse                                         | Desktop and mobile performance/accessibility scores reached 100/100                       |
| Accessibility                                      | Lighthouse checks passed; a full assistive-technology audit remains separate              |

The catalogue has **3 services and 9 widget types**; the two-person assignment
requires at least 3 services and 6 widgets. Counts alone do not establish full
assignment completion: email delivery and final live demonstration remain.

## Troubleshooting

| Problem                             | Action                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE`                        | Stop the other server or change the local port                                                             |
| GitHub connection is not configured | Set both OAuth credentials and restart the server                                                          |
| GitHub callback error               | Check callback URL and host; retry from Services; expired state/provider errors may appear as backend JSON |
| GitHub needs reconnection           | Use **Reconnect GitHub** in Services or the widget                                                         |
| Cannot disable a service            | Remove its widgets first; use **Disconnect** if you only want to unlink GitHub                             |
| Repository validation error         | Enter `owner/repository` or a repository-root GitHub URL                                                   |
| Data unavailable / rate limit       | Check configuration, retry later or increase the refresh interval                                          |
| RSS cannot load                     | Use a public RSS/Atom URL; private addresses and unsupported feed responses are rejected                   |
| Sign-in rejected                    | Confirm the account first; sign in with username, not email                                                |
| Chromium missing                    | Run `npx playwright install chromium`                                                                      |
| `better-sqlite3` fails to install   | Check Node version; native builds may require Python and C/C++ tools                                       |

## Further documentation

- [Frontend implementation, verification and backend handoff](docs/frontend.md)
- [Original bootstrap exercises](docs/bootstrap.md)
- [Technology decision matrix](docs/decisions/decision-matrix.md)
- [Original decision-matrix spreadsheet](docs/decisions/Bootstrap_Decision_Matrix_khushan.xlsx)
- [Historical bootstrap verification log](docs/verification/bootstrap.txt)
