# Dashboard

A personal dashboard for weather, public GitHub repositories and RSS/Atom feeds.
Create and confirm an account, sign in, then configure widgets with independent
refresh intervals. Each account has its own saved widget configuration and order.

## Run locally

Use Node.js 22 LTS or 24 LTS and npm. From the repository root:

```sh
npm ci
npm start
```

Open http://localhost:8080. The server serves both the frontend and API.
There is no separate frontend development server or build step.
SQLite files are created automatically in `data/`.

## Run with Docker

```sh
docker-compose build
docker-compose up
```

For Docker Compose v2 use `docker compose build` / `docker compose up`.
The existing `server` service exposes port 8080 and persists SQLite in `./data`.
Check http://localhost:8080/health and http://localhost:8080/about.json.

## First use

1. Choose **Create account**, enter a username, email and password.
2. Choose **Confirm account**. The existing development API returns a code,
   which the form fills in. This server does not send confirmation emails.
3. Sign in with the confirmed account.
4. Weather is enabled by default. Open **Services** to enable GitHub or RSS.
5. Choose **Add widget**, select its type, fill in its parameters and refresh rate.
6. Edit, refresh or remove a widget with its footer controls. Reorder widgets
   by dragging the handle or using the arrow buttons (also usable on mobile
   and with the keyboard). Each instance has an independent configuration.

## Services and widgets

| Service | Widgets | Configuration |
| --- | --- | --- |
| Weather | City temperature, weather conditions, precipitation | City, refresh interval |
| GitHub | Recent commits, open issues, repository stars | Public owner/repository; item count for commits; refresh interval |
| RSS | Latest stories, feed article count, latest article | Feed URL; item count for stories; refresh interval |

The frontend reads the service catalogue from `/about.json`. Weather uses
Open-Meteo and GitHub uses its public REST API. RSS/Atom is parsed as XML.
Responses are rendered as escaped text with HTTP(S)-only article links.
No private-service credentials are collected or stored in the frontend.

Other interface features include responsive layouts, service filters,
loading/error states, retention of last successful data after refresh errors,
confirmation before deletion, native accessible dialogs, visible focus states,
labelled controls and reduced-motion support.

## Current integration boundaries

This is a frontend contribution on top of the supplied backend, not a claim
that the entire project brief is complete:

- Service enable/disable choices are per-account **browser preferences** in
  localStorage. The backend has no subscription routes. This is not OAuth or
  a server-side service subscription; those still need backend integration.
- GitHub supports public repositories only. Private repositories and linking
  an external account need backend OAuth and secure token storage. The older
  `auth/server.js` OAuth exercise runs separately and is not integrated here.
- RSS works when the feed allows cross-origin browser access (CORS). Other
  feeds need a backend RSS proxy with URL validation and SSRF protection.
  There is no third-party proxy or fabricated fallback data.
- The current catalogue contains **3 services and 9 widget types**. The brief
  requires at least `1 + X` services and `3 × X` widgets for `X` students. A team
  of three or more still needs additional backend services; do not count UI
  cards as implemented service integrations.
- Confirmation codes are returned directly by the development backend.
  Production confirmation requires backend email delivery.
- Public provider rate limits apply. Five-minute refresh intervals are the
  default; the API permits intervals as short as ten seconds.

See [frontend implementation and verification](docs/frontend.md),
[push instructions in Russian](docs/PUSH_RU.md), and the preserved
[bootstrap exercises](docs/bootstrap.md).

## Structure and technologies

```text
public/index.html       Responsive pages, forms and dialogs
public/styles.css      Shared visual styles and responsive breakpoints
public/app.js          UI state, authentication, widget CRUD, ordering, timers
public/data.js         Weather/GitHub/RSS data adapters and safe rendering
server/index.js        Existing HTTP API, static files and service catalogue
server/auth.js         Existing account verification and cookie sessions
server/database.js     Existing SQLite connection
server/schema.js       Existing database schema
tests/frontend.cjs     Isolated browser integration checks
```

The frontend uses semantic HTML, CSS and native JavaScript modules to match the
existing project, avoid a second build system and keep the code easy to run and
explain. Node.js and better-sqlite3 remain the backend dependencies. Playwright is
only a development dependency; the Docker image installs production packages.

## Browser checks

```sh
npm ci
npx playwright install chromium
npm run test:frontend
```

On a fresh Linux machine, Playwright may require system browser dependencies:
`npx playwright install --with-deps chromium`.

Tests launch a separate server on port 8187 (`TEST_PORT` can override it), use a
temporary SQLite database, and mock external providers. They do not alter your
normal database or require provider credentials. Tests cover auth/confirmation,
all nine widget types, timers, safe RSS rendering, CRUD, ordering, persistence,
mobile layout, modal keyboard access and session expiry. They do not prove live
provider availability, Docker behavior or full accessibility conformance.
