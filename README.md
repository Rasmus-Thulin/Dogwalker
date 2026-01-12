# 🐾 Rosie's Promenad Timer

En app för att hålla koll på när det är dags att gå ut med Rosie!

## Features

- ⏱️ Timer för nästa promenad (5 timmars intervall)
- 🏆 Highscore för familjemedlemmar
- 🍖 Matningspåminnelser (morgon & kväll)
- 🌤️ Väderprognos från din plats
- 📱 Fullskärmsstöd för mobiler

## Lokal utveckling

```bash
npm install
npm start
```

Appen körs då på `http://localhost:3000`

## Deploy till Koyeb

### Steg 1: Pusha till GitHub

Först, se till att din kod finns på GitHub:

```bash
git add .
git commit -m "Prepare for Koyeb deployment"
git push origin main
```

### Steg 2: Deploy via Koyeb Dashboard

1. **Skapa ett Koyeb-konto**
   - Gå till [koyeb.com](https://www.koyeb.com) och skapa ett gratis konto

2. **Skapa en ny Web Service**
   - Klicka på "Create Web Service"
   - Välj "GitHub" som deployment source
   - Godkänn GitHub-koppling och välj denna repository

3. **Konfigurera deployment**
   - **Name:** `dogwalker` (eller valfritt namn)
   - **Region:** Välj närmaste region (t.ex. `fra` för Frankfurt)
   - **Builder:** `Buildpack`
   - **Build command:** `npm install` (sätts automatiskt)
   - **Run command:** `npm start` (sätts automatiskt)
   
4. **Konfigurera port**
   - Under "Exposing your service":
   - **Port:** `3000`
   - Kryssa i "Publicly accessible"

5. **Deploy!**
   - Klicka på "Deploy"
   - Vänta 1-2 minuter medan appen byggs och deployas
   - Din app kommer att vara tillgänglig på en URL som: `dogwalker-XXXX.koyeb.app`

### Viktiga inställningar:

- **Instance type:** `nano` (gratis tier)
- **Auto-deploy:** På (så att ändringar i GitHub automatiskt deployas)
- **Port:** `3000` (eller miljövariabeln PORT som Koyeb sätter automatiskt)

### Alternativ: Via Koyeb CLI

```bash
# Installera Koyeb CLI (macOS)
brew install koyeb/tap/koyeb-cli

# Eller via curl
curl -fsSL https://cli.koyeb.com/install.sh | sh

# Logga in
koyeb login

# Deploy
koyeb service create dogwalker \
  --app dogwalker \
  --git github.com/DITT_ANVÄNDARNAMN/Dogwalker \
  --git-branch main \
  --ports 3000:http \
  --routes /:3000 \
  --instance-type nano
```

### Efter deployment

Din app kommer att vara tillgänglig på en URL som:
`https://dogwalker-XXXX.koyeb.app`

**OBS!** LocalStorage fungerar fortfarande - varje användare får sin egen data lagrad i sin webbläsare.

## Environment Variables

Appen använder följande environment variables:

- `PORT` - Server port (default: 3000, Koyeb sätter detta automatiskt)

## Teknologier

- HTML5
- CSS3 (Vanilla CSS med gradients och animationer)
- JavaScript (Vanilla JS)
- Node.js + Express (för server deployment)
- Open-Meteo API (för väderprognoser)
