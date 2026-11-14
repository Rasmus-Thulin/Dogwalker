import { reportTravelUpdate } from './travel-status.js';
const widget = document.getElementById('transitWidget');
const routes = {
    train: document.getElementById('nextTrain'),
    bus: document.getElementById('nextBus')
};
let refreshTimer;

function time(value) {
    return value ? new Date(value).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function renderJourney(type, journey) {
    const card = routes[type];
    if (!card) return;
    const departure = card.querySelector('.transit-time');
    const detail = card.querySelector('.transit-detail');
    if (!journey) {
        departure.textContent = '—';
        detail.textContent = 'Ingen avgång nästa timme';
        return;
    }
    departure.textContent = time(journey.departure);
    const delay = Number(journey.delay) || 0;
    detail.textContent = delay > 0 ? `+${Math.ceil(delay / 60)} min`
        : delay < 0 ? `−${Math.ceil(Math.abs(delay) / 60)} min` : 'Enligt tidtabell';
}

async function refreshTransit() {
    if (document.hidden) return;
    try {
        const response = await fetch('/api/transit');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Kunde inte hämta avgångar.');
        const journeys = new Map((result.journeys || []).filter(Boolean).map(journey => [journey.type, journey]));
        renderJourney('train', journeys.get('train'));
        renderJourney('bus', journeys.get('bus'));
        reportTravelUpdate('transit', result.updatedAt, result.stale);
        widget.classList.remove('has-error');
    } catch (error) {
        reportTravelUpdate('transit', NaN, true);
        widget.classList.add('has-error');
    }
}

function start() {
    refreshTransit();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshTransit, 60000);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTransit();
});
start();
