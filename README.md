# HomeScreen

A portrait-oriented Tesla charging dashboard powered by the [Tibber Data API](https://data-api.tibber.com/docs/). Gullan and Tessan appear together in separate cards with rotatable 3D models, battery level, range and charging status.

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

## Automatic Updates

Vehicle data is fetched on startup and every 60 seconds by default. Settings can change the interval from 60 to 3,600 seconds. The app also refreshes when the tab becomes visible or the network reconnects.

Updates preserve the existing 3D players and retain the last successful data during temporary errors. Data freshness depends on when each vehicle reports to Tibber; available metrics depend on the vehicle integration.

## 3D Models

The app embeds Sketchfab models using its Viewer API. Internet access is required. Player controls remain visible because hiding them is restricted by Sketchfab account plans.

- [2021 Tesla Model Y](https://sketchfab.com/models/59e2ead369984b1a85c800ff6cf6789d) by [tonielpro520](https://sketchfab.com/tonielpro520), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The displayed paint is changed to reflective graphite grey.
- [Tesla Model 3 2024](https://sketchfab.com/models/36c52f3f89f6439c90310f14e8ff33f2) by [brandonleong28](https://sketchfab.com/brandonleong28), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The displayed paint is changed to white.

## Security

- Client configuration: `~/.homescreen-tibber-config.json`.
- OAuth tokens: `~/.homescreen-tibber-tokens.json`.
- Both files are restricted to the server user. The browser does not receive the client secret or OAuth access token.
- Never commit credentials, tokens or environment files.
- The server is intended for local use. Do not expose it publicly without authentication and security hardening.
