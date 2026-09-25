# Dashboard

**Built by you. For you.**

A personal dashboard that brings weather, GitHub activity and RSS feeds into one
workspace. Choose your sources, configure your widgets and give each one its own
refresh interval.

Developed for the **Epitech G-WEB-500 Dashboard project** by a team of two.

[Getting started](#getting-started) · [Widgets](#services-and-widgets) ·
[Architecture](#architecture) · [Tests](#testing) · [Roadmap](#roadmap)

## Features

- **Personal accounts** — registration, account confirmation, sign-in and sign-out
- **Custom dashboards** — add, configure, edit and remove widget instances
- **Flexible layout** — reorder widgets by dragging or using the arrow buttons
- **Independent refresh** — automatic updates per widget, individual refresh and refresh-all
- **Saved workspace** — widget settings and order persist in SQLite for each user
- **Responsive interface** — layouts for desktop and mobile, service filters and an account page
- **Clear feedback** — loading states, actionable errors and visibly marked stale data after failed updates
- **Keyboard support** — labelled controls, visible focus indicators and dialogs that support Escape

The application currently includes **3 services and 9 configurable widget types**.
Server-side subscriptions, OAuth account linking and email delivery are planned;
see [Current limitations](#current-limitations) for the exact integration status.

## Getting started

### Local development

Requirements: **Node.js 22 or 24**, npm and a modern browser. Internet access is
needed to load external widget data. Run these commands from the repository root:

```bash
npm ci
npm start
```

Open **[http://localhost:8080](http://localhost:8080)**.

The same server serves the frontend and API. There is no separate frontend build
step and no API key is required for the current public integrations. The database
is created automatically at `data/dashboard.sqlite`.

Keep the terminal open while using the application. Press `Ctrl+C` to stop it.

### Docker

With Docker and Docker Compose installed:

```bash
docker-compose build
docker-compose up
```

For Docker Compose v2, use:

```bash
docker compose build
docker compose up
```

The `server` service exposes port **8080**. The `./data:/app/data` bind mount keeps
the database on the host when containers are recreated. Stop the local npm server
before starting Docker if it is already using port 8080.

To stop the Compose services:

```bash
docker compose down
```

### Check the server

```bash
curl http://localhost:8080/health
curl http://localhost:8080/about.json
```

`/health` checks database connectivity. `/about.json` reports the client IP,
current Unix timestamp, services, widget identifiers and configuration parameters.

## Using the dashboard

1. Select **Create account** and enter a username, email and password. Usernames
   require at least 3 characters; passwords require at least 8.
2. Select **Confirm account**. In the current development flow, the server returns
   a confirmation code and the form fills it in. No email is sent.
3. Sign in using your username and password.
4. Open **Services** to enable GitHub or RSS. Weather is available by default.
5. Select **Add widget**, choose its service and type, enter its parameters and
   select a refresh interval.
6. Use the card controls to refresh, edit, move or remove the widget.

You can add the same widget more than once with different settings, such as
weather in Barcelona and Tokyo, or activity from two GitHub repositories.

The default interval in the widget form is **5 minutes**. The minimum is
**10 seconds**; frequent requests can reach external service rate limits.

### Example: recent GitHub commits

On the Services page, enable GitHub. Then add a widget with:

| Field           | Value          |
| --------------- | -------------- |
| Service         | GitHub         |
| Widget          | Recent commits |
| Repository      | `react/react`  |
| Number of items | `5`            |
| Refresh every   | `5 minutes`    |

Enter repositories as `owner/repository`, without the `https://github.com/` prefix.
Placeholder text in an input is an example, not a submitted value.

## Services and widgets

Every widget supports its own refresh interval in addition to these parameters:

| Service | Widget             | Parameters             | Displays                                        |
| ------- | ------------------ | ---------------------- | ----------------------------------------------- |
| Weather | City temperature   | City                   | Current temperature in °C                       |
| Weather | Weather conditions | City                   | Current weather description                     |
| Weather | Precipitation      | City                   | Current precipitation in mm                     |
| GitHub  | Recent commits     | Repository, item count | Commit messages, authors and links              |
| GitHub  | Open issues        | Repository             | Open issue count, excluding pull requests       |
| GitHub  | Repository stars   | Repository             | Repository star count                           |
| RSS     | Latest stories     | Feed URL, item count   | Recent article titles and links                 |
| RSS     | Feed article count | Feed URL               | Number of entries currently present in the feed |
| RSS     | Latest article     | Feed URL               | The newest entry as ordered by the feed         |

Weather data comes from Open-Meteo. GitHub widgets use its public REST API.
RSS widgets support RSS and Atom feeds that allow cross-origin browser access.
Item-count inputs accept **1–20** entries.

## Architecture

The browser requests authentication and saved widget settings from the Node.js
server. The server persists accounts, sessions and widget instances in SQLite.
Currently, the browser fetches displayed widget data directly from external
providers. Moving those requests to the backend is part of the roadmap.

| Layer              | Technology                        | Purpose                                            |
| ------------------ | --------------------------------- | -------------------------------------------------- |
| Interface          | HTML, CSS, JavaScript modules     | Responsive views, forms and widget rendering       |
| Application server | Node.js built-in HTTP module      | JSON API and static file serving                   |
| Persistence        | SQLite with `better-sqlite3`      | Accounts, sessions and widget configurations       |
| Authentication     | Node.js `crypto`, cookie sessions | Salted scrypt password hashes and session handling |
| Browser tests      | Playwright                        | User-flow and integration checks                   |
| Packaging          | Docker and Docker Compose         | Consistent application startup                     |

Native JavaScript keeps the frontend compatible with the existing server without
an additional build system. SQLite provides local persistence without a separate
database service. Playwright is a development dependency and is not installed in
the production Docker image.

### Source layout

| Path                 | Responsibility                                             |
| -------------------- | ---------------------------------------------------------- |
| `public/index.html`  | Pages, navigation, forms and dialogs                       |
| `public/styles.css`  | Visual design and responsive layouts                       |
| `public/app.js`      | UI state, authentication, widget CRUD, ordering and timers |
| `public/data.js`     | Provider adapters, data formatting and safe rendering      |
| `server/index.js`    | HTTP routes, static files and service catalogue            |
| `server/auth.js`     | Registration, verification and session management          |
| `server/database.js` | SQLite connection and initialization                       |
| `server/schema.js`   | Database schema                                            |
| `tests/frontend.cjs` | Browser integration tests                                  |
| `docs/`              | Implementation notes and bootstrap documentation           |

The `auth/`, `books/` and `weather.js` files contain earlier bootstrap exercises.
They are separate from the Dashboard application started by `npm start`.

### Persistence and sessions

- Accounts, sessions, widget configurations and positions are stored in SQLite
- Session cookies are `HttpOnly` and `SameSite=Lax`; sessions last seven days
- Verification tokens expire after 24 hours and are single-use
- Enabled-service preferences currently use per-account browser localStorage
- Each widget has its own timer; pending requests and timers are cancelled when
  the dashboard is rebuilt or the user signs out

## API overview

| Method | Endpoint                | Purpose                                               |
| ------ | ----------------------- | ----------------------------------------------------- |
| GET    | `/health`               | Database health check                                 |
| GET    | `/about.json`           | Service and widget catalogue                          |
| POST   | `/auth/register`        | Create an unconfirmed account                         |
| POST   | `/auth/verify`          | Confirm registration                                  |
| POST   | `/auth/login`           | Create a session                                      |
| POST   | `/auth/logout`          | End the current session                               |
| GET    | `/api/me`               | Get the authenticated user                            |
| GET    | `/api/github`           | Get GitHub connection status and username             |
| GET    | `/auth/github/connect`  | Start GitHub OAuth for the authenticated user         |
| GET    | `/auth/github/callback` | Validate OAuth state and finish the GitHub connection |
| DELETE | `/api/github`           | Remove the current user's GitHub connection           |
| GET    | `/api/widgets`          | List the user's widget instances                      |
| POST   | `/api/widgets`          | Create a widget instance                              |
| PATCH  | `/api/widgets/:id`      | Update a widget or its position                       |
| DELETE | `/api/widgets/:id`      | Remove a widget; returns HTTP 204                     |

All `/api/` routes require an authenticated session. Request bodies use JSON.
There are currently no API routes for service subscriptions or widget source data.

## Configuration

No environment configuration is required for the default local setup.

| Variable               | Default                       | Purpose                                         |
| ---------------------- | ----------------------------- | ----------------------------------------------- |
| `PORT`                 | `8080`                        | Application server port                         |
| `TEST_PORT`            | `8187`                        | Isolated server port used by browser tests      |
| `SCREENSHOT_DIR`       | Unset                         | Optional directory for test screenshots         |
| `CHROMIUM_PATH`        | Unset                         | Optional existing Chromium executable for tests |
| `GITHUB_CLIENT_ID`     | Unset                         | GitHub OAuth application client ID              |
| `GITHUB_CLIENT_SECRET` | Unset                         | GitHub OAuth application secret                 |
| `GITHUB_CALLBACK_URL`  | Derived from the request host | Optional OAuth callback URL                     |

For example, on Linux, macOS or WSL:

```bash
PORT=8081 npm start
```

This changes the local npm server port. The supplied Compose configuration still
uses port 8080, as required by the project brief.

## Testing

Install dependencies and the test browser, then run the suite:

```bash
npm ci
npx playwright install chromium
npm run test:frontend
```

If Linux browser dependencies are missing:

```bash
npx playwright install --with-deps chromium
```

Tests start an isolated server and temporary SQLite database. You do not need to
run `npm start` first, and your normal accounts and widgets are not modified.

The suite covers registration and confirmation, all nine widget renderers,
independent configurations and refresh timers, editing and deletion, persisted
ordering, drag-and-drop, filters, error recovery, unsafe RSS content, mobile
layout, dialog keyboard interaction, logout and session expiry.

**External provider responses are mocked.** These checks verify the application
flow; live integrations, Docker startup and complete accessibility compliance
must also be checked separately. Verification notes are recorded in
[docs/frontend.md](docs/frontend.md).

## Current limitations

| Area                  | Current behavior                                                                        |
| --------------------- | --------------------------------------------------------------------------------------- |
| Service subscriptions | Enabled services are browser preferences, not server-side subscriptions                 |
| GitHub authorization  | Authenticated users can connect one GitHub account; OAuth tokens remain server-side     |
| RSS access            | Feeds must allow browser CORS; other feeds need a backend proxy                         |
| Account confirmation  | Uses a development code returned by the API; does not verify email ownership            |
| Widget ordering       | Positions are saved through individual requests; a failed reorder can partially persist |
| External availability | Provider outages and rate limits can prevent updates                                    |

The two-person assignment requires at least **3 services and 6 configurable
widget types**. The current catalogue exceeds the widget count, but the remaining
integration work still needs to be completed and demonstrated.

## Roadmap

- [ ] Persist service subscriptions and enforce them on the backend
- [ ] Link GitHub accounts through OAuth and keep tokens server-side
- [ ] Provide server-side widget data endpoints, including a protected RSS proxy
- [ ] Send registration confirmation emails and support controlled resending
- [ ] Strengthen API validation, including partial widget updates
- [ ] Connect the frontend to the new subscription, authorization and data endpoints
- [ ] Verify Docker startup and the complete workflow against real providers
- [ ] Prepare the final demonstration and update documentation to match the delivered version

## Troubleshooting

| Problem                             | What to check                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `EADDRINUSE` on startup             | Another process is using the port. Stop it or use a different local `PORT`                             |
| Repository validation error         | Enter `owner/repository`; do not paste a full URL or leave the placeholder untouched                   |
| GitHub source not found             | Check the repository name and whether it is public                                                     |
| Service rate limit reached          | Increase the refresh interval and wait before retrying                                                 |
| RSS cannot load                     | Check that the address returns RSS/Atom and allows browser access; a backend proxy is needed otherwise |
| Account cannot sign in              | Confirm registration first and use the username, not the email address                                 |
| Chromium executable missing         | Run `npx playwright install chromium`                                                                  |
| `better-sqlite3` installation fails | Check the Node.js version; native compilation may require Python and C/C++ build tools                 |

## Further documentation

- [Frontend implementation and verification](docs/frontend.md)
- [Original bootstrap exercises](docs/bootstrap.md)
- [Branch and push instructions in Russian](docs/PUSH_RU.md)
- [Technology decision matrix](decision-matrix.md)

Keep credentials, local account files such as `auth/users.json`, generated
SQLite databases and dependency folders out of version control.
