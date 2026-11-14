import { reportTravelUpdate } from './travel-status.js';
const trafficLabels = { free: 'Inga rapporterade trafikproblem', slow: 'Långsam trafik', stopped: 'Kö, stopp eller avstängning' };
function renderTrafficLine(result, route, line, destination) {
    line.replaceChildren();
    const sections = result.trafficSegments || [];
    route.hidden = result.stale || !sections.length;
    if (route.hidden) return;
    const descriptions = [];
    for (const section of sections) {
        if (!trafficLabels[section.state] || section.end <= section.start) continue;
        const segment = document.createElement('span');
        segment.className = `flow-${section.state}`;
        segment.style.flexGrow = String(section.end - section.start);
        const distance = value => (value * result.distanceMeters / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 });
        const description = `${distance(section.start)}–${distance(section.end)} km: ${trafficLabels[section.state]}`;
        segment.title = description;
        if (section.state !== 'free') segment.tabIndex = 0;
        segment.setAttribute('aria-label', description);
        line.append(segment);
        descriptions.push(description);
    }
    line.setAttribute('aria-label', `Ödåkra till ${destination}. ${descriptions.join('. ')}. Blått betyder inga rapporterade trafikproblem.`);
}
function startCommute({ id, endpoint, destination, durationId, statusId, routeId, lineId }) {
    const duration = document.getElementById(durationId);
    const status = document.getElementById(statusId);
    const route = document.getElementById(routeId);
    const line = document.getElementById(lineId);
    let busy = false;
    let retryAt = 0;
    async function refresh() {
        if (document.hidden || busy || Date.now() < retryAt) return;
        busy = true;
        try {
            const response = await fetch(endpoint);
            const result = await response.json();
            retryAt = Date.now() + Math.max(300, Number(result.retryAfter) || 0) * 1000;
            if (!response.ok) throw new Error('Unavailable');
            if (!result.configured) {
                route.hidden = true;
                duration.textContent = '—';
                status.textContent = 'Bilrestid inte ansluten';
                reportTravelUpdate(id, NaN, true);
                return;
            }
            if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) throw new Error('Invalid duration');
            renderTrafficLine(result, route, line, destination);
            duration.textContent = `${Math.ceil(result.durationSeconds / 60)} min`;
            status.textContent = result.stale ? 'Ej aktuell trafik' : result.delaySeconds >= 60
                ? `+${Math.ceil(result.delaySeconds / 60)} min trafik` : '';
            reportTravelUpdate(id, result.updatedAt, result.stale);
        } catch {
            route.hidden = true;
            duration.textContent = '—';
            status.textContent = 'Bilrestid tillfälligt otillgänglig';
            reportTravelUpdate(id, NaN, true);
            retryAt = Date.now() + 300000;
        } finally { busy = false; }
    }
    document.addEventListener('visibilitychange', refresh);
    setInterval(refresh, 60000);
    void refresh();
}
startCommute({ id: 'hubhult', endpoint: '/api/commute', destination: 'Hubhult', durationId: 'commuteDuration', statusId: 'commuteTraffic', routeId: 'commuteRoute', lineId: 'commuteTrafficLine' });
startCommute({ id: 'jula', endpoint: '/api/commute/jula', destination: 'Jula Hyllinge', durationId: 'julaDuration', statusId: 'julaStatus', routeId: 'julaRoute', lineId: 'julaTrafficLine' });
