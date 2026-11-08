const { createCachedLoader, retryAfterSeconds } = require('./cached-loader');

const API_BASE = 'https://realtime-api.trafiklab.se/v1';
const ROUTES = [
    { id: 'train', mode: 'TRAIN', origin: 'Ödåkra station', search: 'Ödåkra', destination: 'Helsingborg C' },
    { id: 'bus', mode: 'BUS', origin: 'Ödåkra Jupitergatan', search: 'Ödåkra Jupitergatan', destination: 'Helsingborg C', line: '5' }
];

function normalize(value) {
    return String(value || '').toLocaleLowerCase('sv-SE').replace(/centralstation(en)?/g, 'c');
}

function selectStop(groups, route) {
    const wanted = normalize(route.origin).replace(' station', '');
    return groups.find(group => {
        const name = normalize(group.name);
        return name.includes(wanted) && (group.transport_modes || []).includes(route.mode);
    });
}

function selectDeparture(departures, route) {
    const destination = normalize(route.destination);
    return departures.find(departure => {
        const itemRoute = departure.route || {};
        const direction = normalize(`${itemRoute.direction || ''} ${itemRoute.destination?.name || ''}`);
        return !departure.canceled && itemRoute.transport_mode === route.mode &&
            (!route.line || String(itemRoute.designation) === route.line) && direction.includes(destination);
    });
}

function formatDeparture(departure, route) {
    if (!departure) return null;
    return {
        type: route.id,
        origin: route.origin,
        destination: route.destination,
        line: String(departure.route?.designation || ''),
        scheduled: departure.scheduled,
        departure: departure.realtime || departure.scheduled,
        realtime: Boolean(departure.is_realtime),
        delay: Number(departure.delay) || 0,
        platform: departure.realtime_platform?.designation || departure.scheduled_platform?.designation || '',
        direction: departure.route?.direction || departure.route?.destination?.name || route.destination
    };
}

function createTransitService({ apiKey, fetchImpl, ttlMs = 60000 } = {}) {
    const stopIds = new Map();

    async function request(apiPath) {
        const url = new URL(`${API_BASE}${apiPath}`);
        url.searchParams.set('key', apiKey);
        const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || data.error || `Trafiklab request failed (${response.status}).`);
            error.status = response.status;
            error.retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
            throw error;
        }
        return data;
    }

    async function getStopId(route) {
        if (stopIds.has(route.id)) return stopIds.get(route.id);
        const data = await request(`/stops/name/${encodeURIComponent(route.search)}`);
        const stop = selectStop(data.stop_groups || [], route);
        if (!stop) throw new Error(`Could not find ${route.origin} in Trafiklab.`);
        stopIds.set(route.id, stop.id);
        return stop.id;
    }

    async function load() {
        const journeys = [];
        for (const route of ROUTES) {
            const stopId = await getStopId(route);
            const board = await request(`/departures/${encodeURIComponent(stopId)}`);
            journeys.push(formatDeparture(selectDeparture(board.departures || [], route), route));
        }
        return { journeys, updatedAt: Date.now() };
    }

    const cache = createCachedLoader(load, { ttlMs });
    return {
        configured: Boolean(apiKey),
        async get() {
            if (!apiKey) {
                const error = new Error('Set TRAFIKLAB_API_KEY on the server to show departures.');
                error.status = 503;
                throw error;
            }
            return cache.get();
        }
    };
}

module.exports = { createTransitService, selectStop, selectDeparture, formatDeparture };
