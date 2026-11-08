const widget = document.getElementById('transitWidget');
const status = document.getElementById('transitStatus');
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
    const badge = card.querySelector('.transit-badge');
    if (!journey) {
        departure.textContent = '—';
        detail.textContent = 'Ingen avgång nästa timme';
        badge.textContent = type === 'train' ? 'Tåg' : 'Buss 5';
        return;
    }
    departure.textContent = time(journey.departure);
    badge.textContent = type === 'train' ? `Tåg${journey.line ? ` ${journey.line}` : ''}` : `Buss ${journey.line || '5'}`;
    const extras = [];
    if (journey.platform) extras.push(`läge ${journey.platform}`);
    if (journey.delay > 0) extras.push(`+${Math.ceil(journey.delay / 60)} min`);
    else if (journey.realtime) extras.push('i tid');
    detail.textContent = extras.join(' · ') || 'Enligt tidtabell';
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
        status.textContent = result.stale ? 'Visar senast hämtade tider' : `Uppdaterad ${time(result.updatedAt)}`;
        widget.classList.remove('has-error');
    } catch (error) {
        status.textContent = error.message;
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
