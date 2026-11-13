const duration = document.getElementById('commuteDuration');
const traffic = document.getElementById('commuteTraffic');
const updated = document.getElementById('commuteUpdated');
const route = document.getElementById('commuteRoute');
const line = document.getElementById('commuteTrafficLine');
const trafficLabels = { free: 'Inga rapporterade trafikproblem', slow: 'Långsam trafik', stopped: 'Kö, stopp eller avstängning' };
function renderTrafficLine(result) {
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
    line.setAttribute('aria-label', `Ödåkra till Hubhult. ${descriptions.join('. ')}. Blått betyder inga rapporterade trafikproblem.`);
}
let busy = false;
let retryAt = 0;
async function refreshCommute() {
    if (document.hidden || busy || Date.now() < retryAt) return;
    busy = true;
    try {
        const response = await fetch('/api/commute');
        const result = await response.json();
        retryAt = Date.now() + Math.max(300, Number(result.retryAfter) || 0) * 1000;
        if (!response.ok) throw new Error('Unavailable');
        if (!result.configured) {
            route.hidden = true;
            duration.textContent = '—';
            traffic.textContent = 'Bilrestid inte ansluten';
            updated.textContent = '';
            return;
        }
        renderTrafficLine(result);
        duration.textContent = `${Math.ceil(result.durationSeconds / 60)} min`;
        traffic.textContent = result.stale ? 'Senast hämtad · ej aktuell trafik' : result.delaySeconds >= 60
            ? `Varav ${Math.ceil(result.delaySeconds / 60)} min trafikfördröjning`
            : 'Med aktuell trafik';
        updated.textContent = `Avresa nu · Hämtad ${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(new Date(result.updatedAt))}`;
    } catch {
        route.hidden = true;
        // Hide old numbers instead of presenting a previous journey as live traffic.
        duration.textContent = '—';
        traffic.textContent = 'Bilrestid tillfälligt otillgänglig';
        updated.textContent = '';
        retryAt = Date.now() + 300000;
    } finally {
        busy = false;
    }
}
document.addEventListener('visibilitychange', refreshCommute);
setInterval(refreshCommute, 60000);
void refreshCommute();
