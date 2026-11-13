const { createCachedLoader, retryAfterSeconds } = require('./cached-loader');
const ORIGIN = 'Månskensgatan 20, Ödåkra, Sverige';
const DESTINATION = 'Älmhultsgatan 2, Malmö, Sverige';

// Distances, rather than point counts, keep the straight line proportional to the road.
function trafficSegments(route) {
    const points = (route.legs || []).flatMap((leg, index) => index ? (leg.points || []).slice(1) : leg.points || []);
    if (points.length < 2) return [];
    const distance = [0];
    const radians = value => value * Math.PI / 180;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return [];
        const haversine = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
            Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
        distance.push(distance[i - 1] + 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine))));
    }
    const total = distance.at(-1);
    if (!total) return [];
    const incidents = (route.sections || []).filter(section => section.sectionType === 'TRAFFIC').flatMap(section => {
        const { startPointIndex: start, endPointIndex: end } = section;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= points.length || end <= start) return [];
        const major = section.simpleCategory === 'ROAD_CLOSURE' || section.magnitudeOfDelay >= 3 ||
            (Number.isFinite(section.effectiveSpeedInKmh) && section.effectiveSpeedInKmh <= 5);
        const slow = major || section.simpleCategory === 'JAM' || section.delayInSeconds > 0 || section.magnitudeOfDelay > 0;
        if (!slow) return [];
        return [{ start: distance[start] / total, end: distance[end] / total, state: major ? 'stopped' : 'slow' }];
    });
    const boundaries = [...new Set([0, 1, ...incidents.flatMap(section => [section.start, section.end])])].sort((a, b) => a - b);
    const segments = [];
    for (let i = 1; i < boundaries.length; i++) {
        const start = boundaries[i - 1];
        const end = boundaries[i];
        const active = incidents.filter(section => section.start < end && section.end > start);
        const state = active.some(section => section.state === 'stopped') ? 'stopped' : active.length ? 'slow' : 'free';
        const previous = segments.at(-1);
        if (previous?.state === state) previous.end = end;
        else segments.push({ start, end, state });
    }
    return segments;
}

function createCommuteService({ apiKey, fetchImpl, now = Date.now }) {
    let endpoints;
    async function request(url) {
        url.searchParams.set('key', apiKey);
        const response = await fetchImpl(url.href, { timeout: 15000, size: 5 * 1024 * 1024 });
        if (!response.ok) {
            const error = new Error('Kunde inte uppdatera bilrestiden.');
            error.status = [401, 403, 429].includes(response.status) ? response.status : 502;
            error.retryAfter = retryAfterSeconds(response.headers?.get('retry-after'));
            throw error;
        }
        return response.json();
    }
    async function geocode(address, number) {
        const url = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json`);
        url.searchParams.set('countrySet', 'SE');
        url.searchParams.set('limit', '1');
        const data = await request(url);
        const match = data.results?.[0];
        if (String(match?.address?.streetNumber) !== number || !Number.isFinite(match?.position?.lat) || !Number.isFinite(match?.position?.lon)) {
            throw new Error('Kunde inte hitta den exakta adressen för bilresan.');
        }
        return `${match.position.lat},${match.position.lon}`;
    }
    const cache = createCachedLoader(async () => {
        if (!endpoints) endpoints = await Promise.all([geocode(ORIGIN, '20'), geocode(DESTINATION, '2')]);
        const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${endpoints.join(':')}/json`);
        for (const [key, value] of Object.entries({ travelMode: 'car', traffic: 'true', departAt: 'now', routeType: 'fastest', routeRepresentation: 'polyline', sectionType: 'traffic' })) url.searchParams.set(key, value);
        const data = await request(url);
        const route = data.routes?.[0];
        const summary = route?.summary;
        if (!Number.isFinite(summary?.travelTimeInSeconds) || summary.travelTimeInSeconds <= 0) throw new Error('Ingen bilrutt hittades.');
        return {
            trafficSegments: trafficSegments(route),
            durationSeconds: summary.travelTimeInSeconds,
            delaySeconds: Math.max(0, Number(summary.trafficDelayInSeconds) || 0),
            distanceMeters: Number(summary.lengthInMeters) || 0,
            updatedAt: now()
        };
    }, { ttlMs: 300000, now });
    return {
        async get() {
            if (!apiKey) return { configured: false };
            const result = await cache.get();
            return { configured: true, ...result.value, stale: result.stale, retryAfter: result.retryAfter };
        }
    };
}
module.exports = { createCommuteService, trafficSegments };
