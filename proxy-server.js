require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { createCachedLoader, retryAfterSeconds } = require('./cached-loader');
const deviceCache = createCachedLoader(loadDevices);

const app = express();
const PORT = Number(process.env.PORT) || 5175;
const tibberApiBase = 'https://data-api.tibber.com/v1';
const tokenPath = path.join(os.homedir(), '.homescreen-tibber-tokens.json');
const configPath = path.join(os.homedir(), '.homescreen-tibber-config.json');
const tokenEndpoint = 'https://thewall.tibber.com/connect/token';
const redirectUri = process.env.TIBBER_REDIRECT_URI || `http://localhost:${PORT}/`;
const usePkce = process.env.TIBBER_USE_PKCE !== 'false';
const oauthStates = new Map();
let refreshInProgress = null;
const clientConfig = {
    clientId: process.env.TIBBER_CLIENT_ID || '',
    clientSecret: process.env.TIBBER_CLIENT_SECRET || ''
};
const configurationManaged = process.env.NODE_ENV === 'production' ||
    Boolean(process.env.TIBBER_CLIENT_ID || process.env.TIBBER_CLIENT_SECRET);

app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
app.use(express.json());

let tokenData = null;
try {
    tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') {
        console.error('Could not read the local Tesla token file:', error.message);
    }
}

if (!configurationManaged) {
    try {
        Object.assign(clientConfig, JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Could not read the local Tibber configuration:', error.message);
        }
    }
}

function saveTokens(tokens) {
    tokenData = tokens;
    fs.writeFileSync(tokenPath, JSON.stringify(tokens), { mode: 0o600 });
    fs.chmodSync(tokenPath, 0o600);
}

function isConfigured() {
    return Boolean(clientConfig.clientId && clientConfig.clientSecret);
}

function saveClientConfig(clientId, clientSecret) {
    const changed = clientConfig.clientId !== clientId || clientConfig.clientSecret !== clientSecret;
    const nextConfig = { clientId, clientSecret };
    fs.writeFileSync(configPath, JSON.stringify(nextConfig), { mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
    Object.assign(clientConfig, nextConfig);

    if (changed) {
        deviceCache.reset();
        tokenData = null;
        try {
            fs.unlinkSync(tokenPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}

function isLocalOrigin(origin) {
    try {
        const url = new URL(origin);
        return url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname) &&
            Number(url.port || 80) === PORT;
    } catch {
        return false;
    }
}

async function exchangeRefreshToken(grant) {
    if (refreshInProgress) return refreshInProgress;
    if (!tokenData?.refresh_token) {
        throw new Error('Connect your Tibber account to start a new session.');
    }

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientConfig.clientId,
        refresh_token: tokenData.refresh_token
    });
    if (clientConfig.clientSecret) body.set('client_secret', clientConfig.clientSecret);
    refreshInProgress = fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    }).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.access_token) {
            const error = new Error(result.error_description || result.error || 'Could not refresh the Tibber token. Reconnect your account.');
            error.status = response.ok ? 502 : response.status;
            error.retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
            throw error;
        }

        saveTokens({
            ...result,
            refresh_token: result.refresh_token || tokenData.refresh_token,
            expires_at: Date.now() + (result.expires_in || 3600) * 1000
        });
        return tokenData.access_token;
    }).finally(() => {
        refreshInProgress = null;
    });
    return refreshInProgress;
}

async function getAccessToken(forceRefresh = false) {
    if (!tokenData?.refresh_token) {
        throw new Error('Your Tibber account is not connected. Open Settings to connect it.');
    }
    if (forceRefresh || !tokenData.access_token || tokenData.expires_at < Date.now() + 60000) {
        return exchangeRefreshToken();
    }
    return tokenData.access_token;
}

async function tibberGet(apiPath, retry = true) {
    const accessToken = await getAccessToken();
    const response = await fetch(`${tibberApiBase}${apiPath}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'HomeScreen/1.0 (localhost; node)'
        }
    });
    if (response.status === 401 && retry && tokenData?.refresh_token) {
        await getAccessToken(true);
        return tibberGet(apiPath, false);
    }

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { error: text || response.statusText };
    }
    if (!response.ok) {
        const error = new Error(data.error || `Tibber request failed (${response.status}).`);
        error.status = response.status;
        error.retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
        throw error;
    }
    return { status: response.status, data };
}

function getRecords(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return payload.data ? getRecords(payload.data, keys) : [];
}

function getRecord(payload, keys) {
    if (!payload || typeof payload !== 'object') return {};
    for (const key of keys) {
        if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
            return payload[key];
        }
    }
    return payload.data && typeof payload.data === 'object' ? getRecord(payload.data, keys) : payload;
}

app.get('/auth/login', (req, res) => {
    if (!isConfigured()) {
        return res.status(503).send(configurationManaged
            ? 'Set TIBBER_CLIENT_ID and TIBBER_CLIENT_SECRET on the server first.'
            : 'Enter your Tibber Client ID and Client Secret in Settings first.');
    }

    const state = crypto.randomBytes(24).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    oauthStates.set(state, codeVerifier);
    const authorizeUrl = new URL('https://thewall.tibber.com/connect/authorize');
    authorizeUrl.search = new URLSearchParams({
        client_id: clientConfig.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile email offline_access data-api-user-read data-api-homes-read data-api-vehicles-read data-api-chargers-read',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    }).toString();
    res.redirect(authorizeUrl.toString());
});

async function handleOAuthCallback(req, res) {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send('Tibber sign-in was cancelled. Please try again.');
    const stateKey = String(state || '');
    const codeVerifier = oauthStates.get(stateKey);
    if (!code || !codeVerifier || !oauthStates.delete(stateKey)) {
        return res.status(400).send('Invalid or expired Tibber sign-in attempt. Please reconnect.');
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientConfig.clientId,
            code: String(code),
            redirect_uri: redirectUri
        });
        if (usePkce) {
            body.set('code_verifier', codeVerifier);
        }
        if (clientConfig.clientSecret) body.set('client_secret', clientConfig.clientSecret);
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const result = await response.json();
        if (!response.ok || !result.access_token || !result.refresh_token) {
            if (result.error === 'invalid_client') {
                throw new Error('invalid_client');
            }
            throw new Error(result.error_description || result.error || 'Tibber returnerade ingen giltig token.');
        }
        deviceCache.reset();
        saveTokens({ ...result, expires_at: Date.now() + (result.expires_in || 3600) * 1000 });
        res.redirect('/?connected=1');
    } catch (callbackError) {
        console.error('Tibber OAuth callback failed:', callbackError.message);
        const message = callbackError.message === 'invalid_client'
            ? 'Tibber rejected the Client ID or Client Secret. Return to Garage, check your credentials in Settings and save again.'
            : 'Tibber sign-in failed. Return to Garage and try again.';
        res.status(502).send(message);
    }
}

app.get('/auth/callback', handleOAuthCallback);
app.get('/', (req, res, next) => {
    if (req.query.code || req.query.error) return handleOAuthCallback(req, res);
    next();
});

app.get('/api/auth/status', (req, res) => {
    res.json({
        configured: isConfigured(),
        connected: Boolean(tokenData?.refresh_token),
        clientId: clientConfig.clientId,
        managed: configurationManaged
    });
});

app.post('/api/auth/config', (req, res) => {
    if (configurationManaged) {
        return res.status(403).json({ error: 'Credentials are managed by server environment variables.' });
    }
    if (!isLocalOrigin(req.get('origin') || '')) {
        return res.status(403).json({ error: 'Settings can only be changed from this local app.' });
    }
    const clientId = String(req.body.clientId || '').trim();
    const clientSecret = String(req.body.clientSecret || '').trim();
    if (!clientId || !clientSecret || clientId.length > 256 || clientSecret.length > 2048) {
        return res.status(400).json({ error: 'Enter both the Tibber Client ID and Client Secret.' });
    }

    try {
        saveClientConfig(clientId, clientSecret);
        res.json({ configured: true, clientId: clientConfig.clientId });
    } catch (error) {
        console.error('Could not save local Tibber configuration:', error.message);
        res.status(500).json({ error: 'Could not save Tibber settings locally.' });
    }
});

async function loadDevices() {
    const homesResult = await tibberGet('/homes');
    const homes = getRecords(homesResult.data, ['homes', 'items']);
    const devices = [];
    // Stop immediately on throttling instead of starting a burst for every home/device.
    for (const home of homes) {
        const homeId = home.id || home.homeId;
        if (!homeId) continue;
        const result = await tibberGet(`/homes/${encodeURIComponent(homeId)}/devices`);
        for (const device of getRecords(result.data, ['devices', 'items'])) {
            const deviceId = device.id || device.deviceId;
            let details = {};
            if (deviceId) {
                try {
                    const response = await tibberGet(`/homes/${encodeURIComponent(homeId)}/devices/${encodeURIComponent(deviceId)}`);
                    details = getRecord(response.data, ['device', 'item']);
                } catch (error) {
                    // A missing individual device may still be represented by its list entry.
                    if (error.status !== 404) throw error;
                }
            }
            devices.push({ ...device, ...details, homeName: home.name || home.nickname || 'Tibber-hem' });
        }
    }
    return devices;
}

app.get('/api/devices', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!tokenData?.refresh_token) return res.status(401).json({ error: 'Your Tibber account is not connected.' });
    try {
        const result = await deviceCache.get();
        if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
        res.json({ devices: result.value, updatedAt: result.updatedAt, stale: result.stale, retryAfter: result.retryAfter });
    } catch (error) {
        const status = error.status || (error.message.includes('not connected') ? 401 : 502);
        const retryAfter = error.retryAfter || 0;
        if (retryAfter) res.set('Retry-After', String(retryAfter));
        res.status(status).json({
            error: status === 429 ? 'Tibber has temporarily paused updates. The dashboard will retry automatically.' : error.message,
            retryAfter
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Tibber Data API server is running' });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`HomeScreen and Tibber Data API server running at http://localhost:${PORT}`);
});
