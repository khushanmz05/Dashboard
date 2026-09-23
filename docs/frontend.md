# Frontend implementation

## Scope

The existing Node HTTP server, database, authentication implementation,
service catalogue, Dockerfile and Compose file are unchanged. Production
frontend code is in `public/`; it needs no bundler or UI framework.

## API integration

- `GET /api/me`: restore the signed-in user with the existing HttpOnly cookie.
- `POST /auth/register`: register, then open the confirmation form.
- `POST /auth/verify`: explicitly confirm the returned development token.
- `POST /auth/login` and `POST /auth/logout`: start/end a session.
- `GET /about.json`: populate service/widget choices and parameter forms.
- `GET/POST /api/widgets`: load/create instances.
- `PATCH /api/widgets/:id`: edit parameters, refresh rate or saved position.
- `DELETE /api/widgets/:id`: delete; explicitly handles an empty 204 response.

Errors are shown at the relevant form or widget. Authentication expiry returns
to the sign-in screen, closes dialogs and stops all widget timers. Forms prevent
duplicate submission while pending.

## Data and timer model

Each instance has its own runtime, AbortController, last successful response,
error state and timeout. An update is scheduled after the previous request
finishes; there are no overlapping requests for the same instance. Requests
have a 15-second timeout. Deleted/edited instances and sign-out abort obsolete
requests and cancel timers. A generation counter prevents late responses from
writing into a different session or a rebuilt dashboard.

Manual refresh, automatic refresh and refresh-all use the same loader. Changing
a service filter hides cards but leaves their refresh schedules active.
External errors do not replace an earlier valid result with invented data;
the previous result remains visibly marked as stale. No demo records are seeded.

- Open-Meteo: geocode a city, then request current temperature, weather code
  and precipitation. Ambiguous city names use the provider's first match.
- GitHub: public commit list, star count, and a search for open issues that
  explicitly excludes pull requests. Private repositories are not supported.
- RSS/Atom: direct browser fetch, XML parsing, item limit and safe article links.
  CORS must be enabled at the feed origin; otherwise an actionable error appears.

## Ordering and accessibility

The drag handle uses native desktop drag-and-drop. Previous/next controls offer
an equivalent mobile and keyboard path. Reordering writes normalized positions
for all instances, rather than decrementing one position and leaving ties.
The existing backend has no atomic reorder endpoint: a failed sequence can
partially save an order. The UI reports the failure and reloads server state.
An atomic bulk reorder endpoint is a future backend improvement.

Dialog elements provide native focus trapping, Escape dismissal and focus
restoration. Buttons have labels, forms have visible labels, and errors have
status/alert semantics. A skip link, visible focus styles and responsive
breakpoints are included. Automated layout checks do not replace a complete
screen-reader/accessibility audit.

## Remaining backend work for the full assignment

1. Authenticated subscription endpoints backed by `user_services`, with server
   validation that a user may create widgets for that service.
2. OAuth account linking and server-held tokens for private services.
3. A safe RSS proxy to support sources that do not allow browser CORS.
4. Additional providers if the team size requires more than three services.
5. Actual confirmation email delivery for deployment beyond local development.

The UI labels the current service selections as browser preferences. It does
not claim that an external account has been linked or a server subscription
has been created.

## Verification

Run `npm run test:frontend` after installing Chromium as documented in README.
The test server and database are disposable. External provider responses are
controlled fixtures, while account and widget operations use the real API.
The test covers both successful responses and failure recovery, XSS-like RSS
content, unsafe URL rejection, independent per-instance data/timers, saved
order, desktop dragging, mobile layout, confirmation/cancellation and expired
sessions. Optional `SCREENSHOT_DIR=/absolute/path` saves local review images.
An existing Chromium executable can be selected with `CHROMIUM_PATH`.

Provider references:
- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/geocoding-api
- https://docs.github.com/en/rest/commits/commits
- https://docs.github.com/en/rest/repos/repos
- https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests

### Results on 2026-09-23

All browser integration checks passed against the supplied backend using Node
24 and headless Chromium at desktop (1440 px) and mobile (390 px) widths.
The login, dashboard and mobile screenshots were visually inspected. The nine
provider renderers were checked with fixtures, including failure recovery.
Live Open-Meteo HTTP responses were also reachable; geocoding allowed the local
origin through CORS. Live GitHub verification timed out in the build environment.
Docker was unavailable here, so Compose execution was not tested.
