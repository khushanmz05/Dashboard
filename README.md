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

**Just want to try the website?** Open [the live Dashboard](https://gayboyz.lol)
in your browser. Nothing needs to be installed for the online version.

**Want to run the project on your own computer?** Follow the steps below.
You will run a separate local copy: accounts and widgets from the online website
will not appear in it. No programming experience is required.

### Docker

Docker runs the website and its database for you. For this route, you need a
web browser, an internet connection and Docker. You do **not** need to install
Node.js, npm or a database separately, or create any configuration files.

#### Step 1 — Install and open Docker

1. Open [the official Docker installation page](https://docs.docker.com/get-started/get-docker/).
2. Select your operating system: **Windows**, **Mac** or **Linux**. Follow its
   installation instructions. On Mac, choose the download matching your chip
   (**Apple silicon** or **Intel**).
3. On Windows, if the installer asks you to enable **WSL 2**, follow its prompts.
   Restart your computer if requested.
4. Open **Docker Desktop** and wait until its engine is running. Keep it open
   while using the local website.

If you already use Docker Engine on Linux, keep your existing installation;
make sure it is running and that the Docker Compose plugin is installed.

**Only if you use Ubuntu inside Windows (WSL):** in Docker Desktop, open
**Settings → Resources → WSL Integration**, enable your Ubuntu distribution,
and apply the change. See [Docker's WSL instructions](https://docs.docker.com/desktop/features/wsl/).
Otherwise, using PowerShell on Windows is enough.

#### Step 2 — Download the project

1. Open [this project's GitHub page](https://github.com/EpitechPGE3-2026/G-WEB-500-BAR-5-1-dashboard-1).
   Sign in to GitHub if needed. If the repository is private, your account must
   have access; ask the project team if you see a 404 page.
2. Click the green **Code** button, then **Download ZIP**.
3. Extract the ZIP file: on Windows, right-click it and choose **Extract All**;
   on macOS, double-click it; on Linux, use your archive manager's **Extract** option.
4. Open the extracted folder. If it contains another folder, open that too,
   until you can see **`docker-compose.yml`**, **`package.json`** and **`README.md`**.
   This is the **project folder** (also called the repository root).

Already downloaded or cloned the project? Use that folder and skip the download.
Do not try to run the project from inside the ZIP file.

#### Step 3 — Open a terminal in the project folder

A terminal is a window where you paste commands and press **Enter** to run them.
Copy only the commands in the boxes below, one line at a time.

| Your system | How to open the terminal in the right folder |
| --- | --- |
| Windows | Open the project folder in File Explorer. Click its address bar, type `powershell`, and press Enter. |
| macOS | Open Terminal. Type `cd` followed by a space, drag the extracted project folder into the terminal, and press Enter. |
| Linux | Right-click inside the project folder and choose **Open in Terminal**, if available. Otherwise open Terminal and run `cd "/full/path/to/the/project"`, replacing the quoted path with your folder's path. |
| Ubuntu / WSL | Open Ubuntu and run `cd ~/G-WEB-500-BAR-5-1-dashboard-1` if you cloned the project into your home folder. For another location, use `cd` followed by its actual path. |

Check that the terminal is in the correct folder:

```text
ls
```

The list must include **`docker-compose.yml`**. If it does not, return to the
folder from Step 2 before continuing.

Now check Docker:

```text
docker --version
docker compose version
docker info
```

The first two commands should show version numbers. `docker info` should show
server information without a connection error. If a command fails, use the
[troubleshooting table](#troubleshooting) before going further.

#### Step 4 — Build and start the website

Paste this command into the same terminal, then press Enter:

```text
docker compose up --build -d --wait
```

Docker downloads the required software, builds the project, creates the database
and starts both parts of the website. **The first run can take several minutes.**
Keep the internet connection available and wait for the command to finish.

`--build` builds the application, `-d` keeps it running in the background, and
`--wait` waits for its startup checks. Once the command finishes successfully,
you can type another command. Confirm the result with:

```text
docker compose ps
```

You should see **two services**, `backend` and `frontend`, both marked
**Up (healthy)**. The exact spacing and container names may differ.
The frontend's port mapping should include `8080->80`.

#### Step 5 — Open the website and create an account

1. Open a browser on the **same computer** where you started Docker.
2. Enter **[http://localhost:8080](http://localhost:8080)** in the browser's
   address bar. Use `http`, not `https`, for this local address.
3. You should see the Dashboard page with **Welcome back**, **Sign in** and
   **Create account**. Choose **Create account**.
4. Enter a username (at least **3 characters**), a valid email address and a
   password (at least **8 characters**), then submit the form.
5. Click **Confirm account** on the next screen. The confirmation code is filled
   in automatically. **No email is sent; you do not need to check your inbox.**
6. Sign in using the **username and password** you just created.

For a fresh local installation, use ordinary registration first. The
**Continue with GitHub** button needs the optional [GitHub setup](#github-setup).
GitHub credentials from the live website are not included in this repository.

#### Step 6 — Add your first widget

For weather:

1. Click **Add your first widget** or **Add widget**.
2. Select **Weather** as the service and **City temperature** as the widget.
3. Enter a city, for example `Barcelona`.
4. Leave the refresh interval at **5 minutes** and save the widget.

For news, open **Services** and enable **RSS**, then add an RSS **Latest stories**
widget. In **Feed URL**, paste:

```text
https://feeds.bbci.co.uk/news/rss.xml
```

Leave the item count at **5** and save. The widget should display BBC headlines.
Weather and RSS work without API keys, but both need internet access.

#### Stop the website and start it again later

To stop your local copy, run this from the same project folder:

```text
docker compose down
```

Your accounts and saved widgets remain in Docker's storage. To start again,
open Docker Desktop, open a terminal in the project folder, and run:

```text
docker compose up --build -d --wait
```

You can close the terminal after this command completes; the website keeps
running in the background. To stop it, use `docker compose down`.
**Do not add `-v` to the stop command** unless you want to permanently delete
the local database, including accounts and saved widgets.

If you prefer watching startup logs, `docker compose up` also builds and starts
the project. In that mode, leave the terminal open; **Ctrl+C** stops the services.
The background command above is the recommended first-run method.

### GitHub setup

**Optional:** complete this only to use GitHub login or GitHub widgets in your
local copy. Ordinary accounts, weather and RSS already work without it.

1. Sign in to GitHub and open [Register a new OAuth application](https://github.com/settings/applications/new).
2. Fill in the following fields exactly:

| Field | Value for a local installation |
| --- | --- |
| Application name | `Dashboard local` |
| Homepage URL | `http://localhost:8080` |
| Authorization callback URL / Redirect URI | `http://localhost:8080/auth/github/callback` |

3. Leave **Allow wildcard matching** and **Enable Device Flow** off. If offered,
   turn off **Expire user access tokens** for this version: automatic token
   refresh is not implemented yet.
4. Click **Register application**. Copy the **Client ID**, then click
   **Generate a new client secret** and save the new value.
   See [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
5. In the project folder, make a copy of `.env.example` named `.env`.
   If `.env` already exists, edit it instead of overwriting it.

On **Windows PowerShell**:

```powershell
Copy-Item .env.example .env
notepad .env
```

On **macOS, Linux or Ubuntu / WSL**:

```bash
cp .env.example .env
nano .env
```

6. Keep `PORT=8080`. Fill in the two empty GitHub values and check the callback:

```dotenv
PORT=8080
GITHUB_CLIENT_ID=replace_with_your_client_id
GITHUB_CLIENT_SECRET=replace_with_your_client_secret
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
```

Replace the placeholder text after `=` with your actual values. Save the file
as **`.env`**, not `.env.txt`. In Notepad press **Ctrl+S**; in nano press
**Ctrl+O**, **Enter**, then **Ctrl+X**. Keep this file private; it is excluded from Git.

7. Apply the configuration from the project folder:

```text
docker compose up --build -d --wait
```

8. Open [http://localhost:8080](http://localhost:8080) and choose
   **Continue with GitHub**, or sign in normally and open **Services → GitHub → Connect GitHub**.
   Follow GitHub's authorization screen and return to Dashboard.
9. Add a GitHub widget and enter a **public** repository, for example
   `facebook/react` or `https://github.com/facebook/react`.

Use `localhost` consistently; do not switch to `127.0.0.1` halfway through login.
For the deployed website, use its HTTPS domain instead; see the separate
[server deployment instructions](docs/deployment.md). The local startup steps
do not require access to the team's server.

### Run without Docker — for developers

Use this alternative only if you want to run Node.js directly. Stop the Docker
copy first with `docker compose down`, so both copies do not use port 8080.

Install **Node.js 22 or 24** with npm, open a terminal in the project folder,
and check `node --version` and `npm --version`. Then run:

```bash
npm ci
npm start
```

Leave this terminal open and visit [http://localhost:8080](http://localhost:8080).
Press **Ctrl+C** to stop. The Node server serves both the UI and API, and creates
`data/dashboard.sqlite` automatically. This database is separate from Docker's.

If you configured GitHub in `.env`, stop `npm start` and use this command instead:

```bash
node --env-file=.env server/index.js
```

`npm start` does not load `.env` automatically. Native SQLite dependencies may
need build tools for a direct Node installation; use the Docker route if you
want those installed automatically inside the image.

### Check the server

Open [http://localhost:8080/health](http://localhost:8080/health) in your browser.
A working local server returns:

```json
{"status":"ok","database":"connected"}
```

[http://localhost:8080/about.json](http://localhost:8080/about.json) displays the
service/widget catalogue and server timestamp. These are diagnostic pages;
the normal website is at [http://localhost:8080](http://localhost:8080).

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
node --test tests/rss.cjs
```

If Chromium needs Linux system dependencies, use
`npx playwright install --with-deps chromium`.

The frontend and widget API suites start isolated servers and temporary databases; do not start the
app for them. Your normal accounts and widgets are untouched. The frontend
suite tests real authentication, subscriptions, OAuth routes and widget CRUD.
GitHub authorization, token/profile responses and widget data use controlled
fixtures; no real keys or external provider access are needed. The RSS suite
checks BBC-style CDATA titles and Atom parsing using local feed fixtures.

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
| Docker startup                                     | Production images built on Hetzner; both containers healthy and live HTTP/API checks passed |
| Lighthouse                                         | Desktop and mobile performance/accessibility scores reached 100/100                       |
| Accessibility                                      | Lighthouse checks passed; a full assistive-technology audit remains separate              |

The catalogue has **3 services and 9 widget types**; the two-person assignment
requires at least 3 services and 6 widgets. Counts alone do not establish full
assignment completion: email delivery and final live demonstration remain.

## Troubleshooting

| Problem                             | Action                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docker` is not recognized / command not found | Install Docker, open Docker Desktop, then close and reopen the terminal. On Ubuntu/WSL, enable Docker Desktop's WSL Integration for that distribution. |
| Cannot connect to the Docker daemon / Docker engine | Open Docker Desktop and wait for the engine to start. Retry `docker info`. For Docker Engine on Linux, follow its installation instructions to start the service. |
| `docker compose` or `--wait` is not recognized | Update Docker Desktop, or install/update the Docker Compose plugin if you use Docker Engine. Use `docker compose` with a space. |
| No configuration file provided / compose file not found | The terminal is in the wrong folder. Use Step 3 and confirm `ls` lists `docker-compose.yml`. |
| Port 8080 is already allocated / address already in use | Stop another local Dashboard or application using port 8080. If a direct `npm start` is running, press Ctrl+C in that terminal. Then repeat Step 4. |
| Browser says the site cannot be reached | Keep Docker running, run `docker compose ps`, and check both services are healthy. Open `http://localhost:8080` on the same computer, with HTTP rather than HTTPS. |
| Build fails while downloading packages or images | Check your internet connection, then retry `docker compose up --build -d --wait`. If it still fails, save the error text for the project team. |
| A service is unhealthy or exits | Run `docker compose logs --tail=100` from the project folder and share the relevant error with the project team. Do not share your `.env` file. |
| No confirmation email arrives | This version does not send one. After registration, click **Confirm account** using the automatically filled code, then sign in with your username. |
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
- [Server deployment and domain setup](docs/deployment.md)
