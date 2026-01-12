# 🚀 Koyeb Deployment Checklist

## ✅ Klart för Deployment!

Alla nödvändiga filer har skapats:

### Serverfiler
- ✅ `server.js` - Express server som serverar appen
- ✅ `package.json` - Node.js dependencies och scripts
- ✅ `Procfile` - Koyeb startup kommando

### Konfigurationsfiler
- ✅ `app.json` - Koyeb app konfiguration
- ✅ `.gitignore` - Exkluderar node_modules från git

### Dokumentation
- ✅ `README.md` - Fullständiga deployment instruktioner

## 📋 Nästa Steg

### 1. Committa ändringarna till Git

```bash
cd "/Users/rasmus.thulin/CODE V2/Dogwalker"
git add .
git commit -m "Add server for Koyeb deployment"
git push origin main
```

### 2. Skapa ett Koyeb-konto

Gå till https://www.koyeb.com och skapa ett gratis konto.

### 3. Koppla GitHub till Koyeb

- Klicka på "Create Web Service"
- Välj "GitHub" som source
- Godkänn Koyeb att komma åt dina GitHub repositories

### 4. Konfigurera Web Service

**Basics:**
- Name: `dogwalker` (eller välj eget namn)
- Repository: Välj `Dogwalker` repository
- Branch: `main`

**Builder:**
- Builder: `Buildpack` (väljs automatiskt)
- Build command: `npm install` (sätts automatiskt)
- Run command: `npm start` (sätts automatiskt)

**Instance:**
- Instance type: `nano` (gratis)
- Regions: Välj närmaste (t.ex. `fra` för Frankfurt)

**Exposing:**
- Port: `3000`
- Protocol: `HTTP`
- ✓ Mark as "Public"

**Environment variables:**
```
PORT=3000
```
(Koyeb sätter ofta detta automatiskt, men bra att ha)

### 5. Deploy!

Klicka på "Deploy" och vänta ~1-2 minuter.

Din app kommer att vara live på en URL som:
```
https://dogwalker-[random].koyeb.app
```

## 🔧 Features som fungerar på Koyeb

- ✅ Timer för hundpromenader
- ✅ Matningspåminnelser
- ✅ Highscore/Leaderboard
- ✅ Väderdata (via geolocation & Open-Meteo API)
- ✅ Fullskärmsläge för mobiler
- ✅ Responsiv design

## 💾 Datalagring

**Viktigt att veta:**
- Appen använder `localStorage` i webbläsaren
- Data sparas lokalt på varje enhet
- Ingen backend-databas krävs
- Varje familjemedlem kan använda sin egen enhet
- Data synkas INTE mellan enheter

## 🔄 Auto-Deploy

Efter första deployment:
- Varje push till `main` branch uppdaterar automatiskt appen på Koyeb
- Ingen manuell deployment behövs
- Build tar ~1-2 minuter

## 📱 Användning

Efter deployment kan familjen:
1. Besöka URL:en på sina mobiler
2. Lägga till som genväg på hemskärmen (iOS: Dela → Lägg till på hemskärmen)
3. Använda som en native app!

## 🆘 Troubleshooting

**Om appen inte startar:**
- Kontrollera Koyeb logs under "Logs" tab
- Verifiera att PORT är satt till 3000
- Kontrollera att `npm install` kördes utan fel

**Om väder inte visas:**
- Tillåt geolocation i webbläsaren
- Kontrollera att Open-Meteo API är tillgängligt

**Om localStorage inte fungerar:**
- Kontrollera att cookies/localStorage är tillåtet i webbläsaren
- Använd inte inkognito/privat läge
