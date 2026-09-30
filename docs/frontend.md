# Frontend implementation and handoff

## Scope and status

This update finishes frontend integration with the backend in the supplied
archive. Server code, database schema, dependencies and Docker configuration
are unchanged. Production frontend files are in `public/`; no build is required.

| Work area | Delivered |
| --- | --- |
| Services | Server-persisted enable/disable state, pending buttons, widget counts and visible conflict errors |
| GitHub | Connect, OAuth return feedback, cancellation, disconnect confirmation and reconnect actions |
| Widget data | Shared API transport, all nine renderers, error/stale states and safe links/text |
| Account confirmation | Development code flow, manual retry, confirmation links, success/error feedback |
| Regression coverage | Real API user flows plus provider fixtures, desktop/mobile checks |

Email delivery and resending cannot be completed through the supplied backend:
there is no send/resend endpoint. The UI does not display a nonfunctional resend
button or claim an email was sent. Account confirmation should remain marked
partial if the corresponding ticket requires delivered email.

## API integration

The service catalogue comes from `/about.json`; form fields are generated from
its widget parameters. Authentication uses `/auth/register`, `/auth/verify`,
`/auth/login`, `/auth/logout` and `/api/me`. Service state comes from
`/api/services`, with POST enable and DELETE disable operations.

`/api/github` provides connection status. The frontend requests
`/auth/github/connect`, validates the returned GitHub authorization URL and
navigates there. The callback redirects supplied by the backend are handled at
`/?github=connected` and `/?github=denied`. The parameter is removed and feedback
is shown on Services. The connected message is checked against actual server
connection state. Tokens are never placed in frontend storage.

Disconnection calls `DELETE /api/github` after confirmation and preserves
saved widgets. Service removal is a different operation: the server blocks it
while widgets exist. Errors are displayed on the active service page.

Widgets use `/api/widgets` and `/api/widgets/:id`; data is fetched exclusively
from `/api/widgets/:id/data`. Weather, GitHub and RSS requests happen on the
backend. Browser cross-origin feed requests and localStorage subscription state
are not used. Repository-root GitHub URLs are normalized to `owner/repository`.

## Error and timer model

`api.js` preserves HTTP status, handles empty 204 responses and supplies network
and invalid-response errors. Form operations prevent duplicate submissions.
Each widget has its own request, last valid HTML, timestamp and refresh timer.
Automatic updates run after the previous request finishes. A generation counter
prevents obsolete responses from updating a rebuilt dashboard. Sign-out and
session expiry abort widget requests and clear timers, data and open dialogs.

A widget data HTTP 401 can mean either an expired Dashboard session or invalid
GitHub credentials. The frontend checks `/api/me` before deciding to sign out.
GitHub 401/403 errors display a reconnect action and pause automatic retries for
the affected widget. A new OAuth return reloads saved state and resumes updates.
Transient failures retain last successful data, visibly marked stale.

External strings are escaped. Links allow only HTTP(S), reject embedded
credentials and use `noopener noreferrer`. Malformed metric/weather/list data
produces an error instead of replacing a valid value with fabricated content.
Filters hide cards without stopping their refresh schedules.

## Confirmation flow

Registration opens a form for the development token returned by the backend.
Users can also open the confirmation form manually or follow
`/?verify_token=TOKEN`. The query token is removed from the address bar before
API requests; confirmation still requires explicit submission. Invalid/expired
codes stay editable. Success returns to sign-in with a confirmation message.

Backend handoff for production email:

- Deliver a single-use confirmation link or code without returning it in the
  production registration response. The UI already supports both entry paths.
- Add a rate-limited resend endpoint with a documented request/response contract.
  Only after that exists should the frontend add and wire a resend action.
- Redirect OAuth callback failures to a documented frontend result as well as
  success/denial. Currently invalid state and some provider errors return JSON
  before the frontend loads, so the UI cannot intercept that navigation.

These are integration dependencies, not endpoints invented by this update.

## Ordering and accessibility

Native desktop drag-and-drop and previous/next buttons share the same saved
ordering path. Positions are normalized across instances. There is no atomic
bulk reorder endpoint; if a request fails, the UI reports it and reloads the
partially saved server order. This remains a backend improvement.

Native dialogs provide keyboard focus containment, Escape and focus return.
Controls have labels, navigation identifies the active page, and feedback has
status/alert semantics. Responsive cards and mobile controls avoid horizontal
page overflow. A complete screen-reader audit remains separate work.

## Verification — 2026-09-30

Run the commands in README. Tests use temporary application copies and databases,
never the user's normal SQLite file. `CHROMIUM_PATH` selects an existing browser;
`SCREENSHOT_DIR` optionally records review screenshots.

- `npm run test:frontend`: passed under Node 24 and headless Chromium, at desktop
  1440 px and mobile 390 px widths.
- `npm run test:widgets-api`: 30 passed, 0 failed.
- Registration, invalid/expired confirmation, token links, login/logout and
  session expiry through widget loading were exercised against real API routes.
- Subscriptions, persistence, disable conflicts and GitHub disconnection use
  the real backend. OAuth authorization and token/profile responses are fixtures,
  while callback state/cookies, credential storage and redirect handling are real.
- All nine widget renderers, URL normalization, unsafe content, malformed data,
  independent refresh, stale-data recovery, ordering and CRUD were exercised.
- A revoked GitHub token fixture verifies that the Dashboard session remains
  active and reconnect is offered. Disconnect keeps saved widgets.
- Desktop/mobile screenshots were inspected for layout and clipping.

Live OAuth credentials, real provider availability, Docker execution and full
accessibility compliance are not established by these automated checks.
