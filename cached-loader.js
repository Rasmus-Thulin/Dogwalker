// Share one upstream refresh across clients and retain the last complete snapshot.
function createCachedLoader(load, { ttlMs = 120000, now = Date.now, random = Math.random } = {}) {
    let snapshot = null;
    let inFlight = null;
    let retryAt = 0;
    let failures = 0;
    let lastError = null;
    let generation = 0;
    const result = stale => ({ ...snapshot, stale, retryAfter: Math.max(0, Math.ceil((retryAt - now()) / 1000)) });
    return {
        reset() {
            generation++;
            snapshot = null;
            inFlight = null;
            retryAt = 0;
            failures = 0;
            lastError = null;
        },
        async get() {
            if (retryAt > now()) {
                if (snapshot) return result(true);
                const error = new Error(lastError?.message || 'Updates are temporarily paused.');
                error.status = lastError?.status || 502;
                error.retryAfter = Math.ceil((retryAt - now()) / 1000);
                throw error;
            }
            if (snapshot && now() - snapshot.updatedAt < ttlMs) return result(false);
            if (inFlight) return inFlight;
            const currentGeneration = generation;
            const pending = (async () => {
                try {
                    const value = await Promise.resolve().then(load);
                    if (currentGeneration !== generation) throw Object.assign(new Error('Connection changed. Please refresh.'), { status: 409 });
                    snapshot = { value, updatedAt: now() };
                    failures = 0;
                    retryAt = 0;
                    lastError = null;
                    return result(false);
                } catch (error) {
                    if (currentGeneration !== generation) throw error;
                    const status = Number(error.status) || 502;
                    // Configuration/authentication errors should never reuse another session's data.
                    if (status >= 400 && status < 500 && status !== 429) throw error;
                    failures++;
                    const base = status === 429 ? 300000 : 30000;
                    const delay = Math.min(1800000, base * 2 ** Math.min(failures - 1, 6));
                    retryAt = now() + Math.max(Number(error.retryAfter) * 1000 || 0, delay) + Math.floor(random() * 1000);
                    lastError = error;
                    if (snapshot) return result(true);
                    error.retryAfter = Math.ceil((retryAt - now()) / 1000);
                    throw error;
                } finally {
                    if (inFlight === pending) inFlight = null;
                }
            })();
            inFlight = pending;
            return pending;
        }
    };
}

function retryAfterSeconds(header, now = Date.now()) {
    if (!header) return 0;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : 0;
}
module.exports = { createCachedLoader, retryAfterSeconds };
