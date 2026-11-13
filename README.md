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

The transit panel shows the next train from Ödåkra station and bus 5 from Ödåkra Jupitergatan toward Helsingborg C. Add a Trafiklab Realtime APIs key as `TRAFIKLAB_API_KEY`. The key stays on the server; departures are shared through a 60-second cache and polling pauses while the display is hidden. Transit data is provided by Trafiklab under CC BY 4.0.

Use **Fullscreen** in the footer to enter or exit fullscreen (Escape also exits). Browsers without the Fullscreen API can use their own fullscreen controls. The display adapts between stacked portrait cards and side-by-side landscape cards. Weather and charging animations respect reduced-motion preferences.

## Automatic Updates

The browser checks for vehicle data on startup and every 60 seconds by default while visible. The server shares a two-minute snapshot across all clients and permits only one upstream refresh at a time. Settings can change the interval from 60 to 3,600 seconds. The app also refreshes when the tab becomes visible or the network reconnects.

Updates preserve the existing 3D players and retain the last successful data during temporary errors. A Tibber 429 pauses upstream requests for at least five minutes (longer when `Retry-After` requires it), with exponential backoff for repeated failures. Cached values remain visible with their original update time and the next retry time. Switching back to the iPad app does not bypass this pause. Data freshness depends on when each vehicle reports to Tibber; available metrics depend on the vehicle integration.

The vehicle cards estimate the cost from the current battery level to the charge limit using Tibber's current 15-minute consumption price (including `thirdPartyPrice` when supplied), a 75 kWh usable battery assumption and 90% charging efficiency. This requires the `data-api-prices-read` OAuth scope and reconnecting Tibber after upgrading from an older authorization.

## 3D Models

The app embeds Sketchfab models using its Viewer API. Internet access is required. Player controls remain visible because hiding them is restricted by Sketchfab account plans.

- [Tesla Model Y 2021](https://sketchfab.com/models/e0f703b823e74746b40634d1876f6a13) by [SQUIR3D](https://sketchfab.com/SQUIR3D), Editorial license (embedded Sketchfab viewer). Used for both vehicles: glossy deep black for Gullan and glossy white for Tessan. Each card retains its own Tibber device and live metrics. Bloom is disabled for the white car to prevent a bright halo around its silhouette.

## Security

- Client configuration: `~/.homescreen-tibber-config.json`.
- OAuth tokens: `~/.homescreen-tibber-tokens.json`.
- Both files are restricted to the server user. The browser does not receive the client secret or OAuth access token.
- Never commit credentials, tokens or environment files.
- The server is intended for local use. Do not expose it publicly without authentication and security hardening.

### Children's Outlook calendars

Melwin and Elliot each have a week card below the cars. Configure their published
Outlook ICS subscription URLs in the server's local `.env` file:

```dotenv
MELWIN_CALENDAR_ICS_URL=
ELLIOT_CALENDAR_ICS_URL=
```

Restart `npm start` after setting these values. Keep subscription URLs private and
out of version control: anyone holding a published URL can read that calendar.
The server fetches each calendar at most once every five minutes and returns only
activities for the requested week, without exposing the subscription URL to the
browser. Cards refresh automatically and support recurring, edited, cancelled,
all-day and multi-day events. Times display in Europe/Stockholm. Scroll within a
day to see additional activities. Outlook publication updates may be delayed.

Team schedules are merged directly into each child's HomeScreen card alongside
Outlook. `MELWIN_TEAM_CALENDAR_ICS_URL` subscribes to Ödåkra IF P-2015 and
`ELLIOT_TEAM_CALENDAR_ICS_URL` to Ödåkra IF P-2018 (see `.env.example`). These feeds
refresh independently every five minutes; a temporary failure of one source does
not hide events from another. Identical title/start/end combinations appear once.
This displays team activities in HomeScreen; it does not copy them into Outlook.

### Samsung A7 display

The dashboard requests Screen Wake Lock and reacquires it after returning to the
page or fullscreen. It retries after interaction and once per minute if the OS
releases it. The display status is shown in Login & display. On the tablet, serve
the dashboard over trusted HTTPS: opening `http://<computer-ip>:5175` is not a
secure context and cannot use Screen Wake Lock. `localhost` only counts as local
on the device running the browser.

Chrome and Samsung Internet cannot set Android's backlight brightness. For a
fixed maximum, disable Adaptive brightness in Android Settings > Display and set
the brightness slider to 100%. For programmatic enforcement, use a native Android
wrapper or a kiosk browser with brightness controls. Screen Wake Lock prevents
idle dimming; it does not override Android's brightness or power policy.

### Car commute to IKEA Hubhult

The travel panel also supports driving time from Månskensgatan 20, Ödåkra to
Älmhultsgatan 2, Malmö (IKEA Hubhult). Set `TOMTOM_API_KEY` in the local `.env`
file and restart the server. Use a free TomTom account without adding a payment
method or upgrading to a paid plan; enable Routing and Geocoding/Search access.
The server resolves the two addresses, requests the fastest car route with
`traffic=true` and `departAt=now`, and shares one refresh across clients every
five minutes (at most 8,928 routing calls in a 31-day month of continuous use).
Check the account's current free quota before activation, including any other
apps using the key. No Google billing account or paid fallback is used.

Without a key the UI explicitly shows that driving time is not connected. Old
values are labelled as previously fetched, and errors never display a made-up
travel estimate. The addresses are sent to TomTom only after a key is configured.

The commute includes a straight traffic strip from Ödåkra to Hubhult. It uses
`sectionType=traffic` and route geometry from the same routing request, so no
additional traffic API calls are required. Segment positions are proportional to
road distance. Blue means no reported traffic problem, orange a reported slowdown,
and red a major jam, near-stationary traffic (at most 5 km/h), or closure. This is
an incident-based overview, not a guarantee of traffic coverage on every road.
Hover/focus affected segments for distance ranges. Hide the strip when traffic
data is unavailable or stale.
