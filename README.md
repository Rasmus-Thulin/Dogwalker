# HomeScreen

A weather and Tesla dashboard powered by the [Tibber Data API](https://data-api.tibber.com/docs/). Gullan and Tessan appear together in separate cards with rotatable 3D models, battery level, range and charging status.

## Run Locally

Requires Node.js 20 or later and npm.

```bash
npm ci
npm start
```

Open http://localhost:5175/. This app needs its Node server; static hosting alone does not provide the Tibber integration.

## Connect Tibber

1. Create a client in [Tibber Data API client management](https://data-api.tibber.com/clients/manage/).
2. Register `http://localhost:5175/` as the callback URL. Grant `openid`, `profile`, `email`, `offline_access`, `data-api-user-read`, `data-api-homes-read`, `data-api-vehicles-read` and `data-api-chargers-read`.
3. Connect your vehicles to Tibber.
4. Open **Settings** in HomeScreen on the server computer. Enter your Client ID and Client Secret, then select **Save credentials**.
5. Select **Connect Tibber** and approve access.

OAuth uses PKCE. Credentials and tokens are stored locally by the server, not in browser storage or the repository.

## Production Configuration

Configure these variables in your hosting service's environment settings:

```text
NODE_ENV=production
TIBBER_CLIENT_ID=<your client ID>
TIBBER_CLIENT_SECRET=<your rotated client secret>
TIBBER_REDIRECT_URI=https://<your app domain>/
```

Register the exact `TIBBER_REDIRECT_URI` value as a callback URL in your Tibber client. Once configured, open **Settings** and select **Connect Tibber**; you do not need to save client credentials in the browser.

In production, or whenever Tibber credentials are supplied through environment variables, the server ignores the local client configuration file and disables browser credential changes. Both client variables are required. The frontend hides the credential form, and the secret is never returned by the status API.

The local-only settings error is intentional protection, not a reason to allow arbitrary origins. Do not hardcode secrets in JavaScript or commit them to GitHub. Rotate any secret shared in chat or source code before deploying.

For local environment configuration, use `.env.example` as the template for an ignored `.env` file. Use persistent private storage for the server user's OAuth token file if you want the Tibber connection to survive redeployments. Public hosting still requires access control; environment variables alone do not make this dashboard safe to expose publicly.

## Display and weather

The dark glass interface uses translucent panels, subtle edge highlights and a uniform white text palette. Reduced transparency, increased contrast and reduced motion preferences are supported.

The header shows a live clock, animated weather conditions and a six-hour forecast from [Open-Meteo](https://open-meteo.com/). The browser requests the device location on startup and uses Ödåkra when location access is denied, unavailable or times out. Device coordinates are rounded to city-level precision and sent to Open-Meteo for weather and BigDataCloud for the locality name; they are not saved in browser storage. Change the city manually or retry **Use my location** through **Login** in the footer. Weather refreshes every 15 minutes and retains the last successful forecast during temporary errors.

Use **Fullscreen** in the footer to enter or exit fullscreen (Escape also exits). Browsers without the Fullscreen API can use their own fullscreen controls. The display adapts between stacked portrait cards and side-by-side landscape cards. Weather and charging animations respect reduced-motion preferences.

## Automatic Updates

The browser checks for vehicle data on startup and every 60 seconds by default while visible. The server shares a two-minute snapshot across all clients and permits only one upstream refresh at a time. Settings can change the interval from 60 to 3,600 seconds. The app also refreshes when the tab becomes visible or the network reconnects.

Updates preserve the existing 3D players and retain the last successful data during temporary errors. A Tibber 429 pauses upstream requests for at least five minutes (longer when `Retry-After` requires it), with exponential backoff for repeated failures. Cached values remain visible with their original update time and the next retry time. Switching back to the iPad app does not bypass this pause. Data freshness depends on when each vehicle reports to Tibber; available metrics depend on the vehicle integration.

## 3D Models

The app embeds Sketchfab models using its Viewer API. Internet access is required. Player controls remain visible because hiding them is restricted by Sketchfab account plans.

- [Tesla Model Y 2021](https://sketchfab.com/models/e0f703b823e74746b40634d1876f6a13) by [SQUIR3D](https://sketchfab.com/SQUIR3D), Editorial license (embedded Sketchfab viewer). The displayed paint is changed to glossy deep black.
- [Tesla Model 3](https://sketchfab.com/models/55daee6824b945bb94f9018197b7949d) by [codexito](https://sketchfab.com/codexito), Standard license (embedded Sketchfab viewer). The original white materials are preserved; the door animation is paused at its closed starting pose and the separate floor object is hidden.

## Security

- Client configuration: `~/.homescreen-tibber-config.json`.
- OAuth tokens: `~/.homescreen-tibber-tokens.json`.
- Both files are restricted to the server user. The browser does not receive the client secret or OAuth access token.
- Never commit credentials, tokens or environment files.
- The server is intended for local use. Do not expose it publicly without authentication and security hardening.
