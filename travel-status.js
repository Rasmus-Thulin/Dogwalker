export function reportTravelUpdate(source, timestamp, stale = false) {
    globalThis.reportDashboardUpdate?.(source === 'transit' ? 'Trafiklab' : 'TomTom', timestamp, stale, source);
}
