const ical = require('node-ical');
const { createCachedLoader } = require('./cached-loader');
const dayKey = (date, timeZone) => new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const textValue = value => String(value?.val ?? value ?? '');

function eventsInRange(parsed, from, to) {
    const events = [];
    for (const event of Object.values(parsed)) {
        if (event.type !== 'VEVENT' || !event.start || event.status === 'CANCELLED') continue;
        for (const instance of ical.expandRecurringEvent(event, { from, to, expandOngoing: true })) {
            if (instance.event.status === 'CANCELLED' || instance.start >= to || instance.end <= from) continue;
            const allDay = instance.isFullDay;
            const zone = instance.start.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
            events.push({
                title: textValue(instance.summary) || 'Aktivitet',
                start: instance.start.toISOString(),
                end: instance.end.toISOString(),
                allDay,
                startDay: allDay ? dayKey(instance.start, zone) : dayKey(instance.start, 'Europe/Stockholm'),
                endDay: allDay ? dayKey(instance.end, instance.end.tz || zone) : dayKey(instance.end, 'Europe/Stockholm')
            });
        }
    }
    return events.sort((a, b) => a.start.localeCompare(b.start));
}

function createCalendarService({ urls, fetchImpl }) {
    const loaders = Object.fromEntries(Object.entries(urls).map(([child, value]) => {
        const entries = (Array.isArray(value) ? value : [{ url: value, label: 'Outlook' }]).filter(source => source.url);
        return [child, entries.map(source => ({
            label: source.label,
            cache: createCachedLoader(async () => {
                // URLs are server configuration only; never accept a fetch target from a browser.
                const target = new URL(source.url);
                if (target.protocol !== 'https:') throw new Error('Invalid calendar URL');
                const response = await fetchImpl(target.href, { timeout: 15000, size: 5 * 1024 * 1024 });
                if (!response.ok) throw new Error('Calendar fetch failed');
                const body = await response.text();
                if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Invalid calendar response');
                return ical.async.parseICS(body);
            }, { ttlMs: 300000 })
        }))];
    }));
    return {
        async get(child, from, to) {
            if (!Object.hasOwn(urls, child)) return null;
            const sources = loaders[child];
            if (!sources.length) return { configured: false, events: [] };
            const results = await Promise.allSettled(sources.map(async source => {
                const snapshot = await source.cache.get();
                return { ...snapshot, label: source.label, events: eventsInRange(snapshot.value, from, to) };
            }));
            const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
            if (!loaded.length) throw new Error('Calendar fetch failed');
            const seen = new Set();
            const events = loaded.flatMap(source => source.events.map(event => ({ ...event, source: source.label })))
                .sort((a, b) => a.start.localeCompare(b.start)).filter(event => {
                    const key = JSON.stringify([event.title.trim().toLocaleLowerCase('sv-SE'), event.start, event.end]);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            return {
                configured: true,
                events,
                sources: sources.map(source => source.label),
                updatedAt: Math.min(...loaded.map(source => source.updatedAt)),
                stale: loaded.length < sources.length || loaded.some(source => source.stale)
            };
        }
    };
}
module.exports = { createCalendarService, eventsInRange };
