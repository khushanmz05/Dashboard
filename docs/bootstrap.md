# Dashboard bootstrap

Node.js 22.6+; no external packages. Run commands from the repository root. The standalone exercises live in `examples/bootstrap/`.

## 1. Decision matrix

See [the decision matrix](decisions/decision-matrix.md): six criteria, weights, three backend and three frontend options, weighted totals, and a 250–300 word provisional recommendation.
Independent team scores and actual disagreement/resolution must still be supplied by the team. Assumed experience scores are explicitly marked.

## 2. REST API

```sh
node examples/bootstrap/books/server.js
```

In another terminal:

```sh
curl http://localhost:8000/books
curl http://localhost:8000/books/1
curl -X POST http://localhost:8000/books -H 'Content-Type: application/json' -H 'Authorization: Bearer bootstrap-token' -d '{"title":"Déchaîner l’intelligence","author":"Pierre Robert"}'
curl -X DELETE http://localhost:8000/books/4 -H 'Authorization: Bearer bootstrap-token'
curl http://localhost:8000/books/9999
```

POST returns 201 with the generated ID; DELETE returns 204. Missing books return 404 with `{"error":"Book not found"}`. POST and DELETE require the hardcoded token `bootstrap-token`: missing Authorization gives 401, an invalid value gives 403. GET routes are public. The three books load from JSON at startup; changes remain in memory until restart.

## 3. Authentication

```sh
node examples/bootstrap/auth/server.js
```

Open http://localhost:3000/private in a private window: it redirects to `/login`.
Sign up on that page, then log in. Close the tab and reopen `/private`: the seven-day session cookie keeps you signed in while the server remains running. Sessions are in memory; users persist in `examples/bootstrap/auth/users.json`. Passwords use scrypt with individual random salts.

This is the final signup stage: the earlier hardcoded `admin` / `s3cr3t` user has been removed as instructed. `/` is public; `/private` requires authentication. Direct access to `/private.html` is not exposed.

### GitHub OAuth setup

Register a GitHub OAuth app with homepage `http://localhost:3000` and callback `http://localhost:3000/auth/github/callback`.
Copy `examples/bootstrap/auth/.env.example` to `examples/bootstrap/auth/.env`, fill the client ID and client secret, and restart the authentication server. Click **Sign in with GitHub** on `/login`.

The callback checks a one-time state value, requests the GitHub identity and verified primary email, and redirects successful logins to `/private`. An existing GitHub ID reuses its user record. If a new GitHub identity has an email already registered locally, login is rejected with 409 and instructions to use the existing password. Accounts are not automatically merged. OAuth tokens are never stored in `users.json`; `.env` and user data are excluded by `.gitignore`.

## 4. External weather API

```sh
node examples/bootstrap/weather.js
node examples/bootstrap/weather.js --city London
node examples/bootstrap/weather.js --city Barcelona
node examples/bootstrap/weather.js --city Tokyo
```

The default city is a variable at the top of the file. Open-Meteo geocoding resolves the city; the forecast API returns its current temperature in Celsius. Output is `City: temperature°C`.

To reproduce the failure exercise, temporarily change `WEATHER_URL` to `https://badurl.xyz/weather`, run the script, then restore `https://api.open-meteo.com/v1/forecast`. Errors print `Error: could not fetch weather data (reason: <message>)` and exit with code 1, without a stack trace.

Cross-check the current reading at the same time against another weather source, for example https://wttr.in/Barcelona?format=3. Different observation times and locations may produce different temperatures.

## Verification status

REST routes and authorization, signup, password hashing, session cookie reuse, private-page protection, and invalid OAuth state were checked locally. Real GitHub login requires your OAuth credentials and has not been completed here. Live weather verification status is recorded in [the original verification log](verification/bootstrap.txt) (commands retain their historical paths).

## API documentation

- GitHub OAuth: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Open-Meteo weather: https://open-meteo.com/en/docs
- Open-Meteo geocoding: https://open-meteo.com/en/docs/geocoding-api
