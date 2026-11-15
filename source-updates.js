// One footer entry per provider; use the oldest update across its consumers.
(() => {
    const sources = new Map();
    globalThis.reportDashboardUpdate = (source, timestamp, stale = false, consumer = 'default', message = '') => {
        if (!sources.has(source)) sources.set(source, new Map());
        if (consumer !== 'default') sources.get(source).delete('default');
        const previous = sources.get(source).get(consumer);
        const updatedAt = Number.isFinite(Number(timestamp)) ? Number(timestamp) : previous?.timestamp;
        sources.get(source).set(consumer, { timestamp: updatedAt, stale, message });
        const footer = document.getElementById('sourceUpdates');
        footer.replaceChildren();
        for (const [name, entries] of sources) {
            const values = [...entries.values()];
            const dates = values.map(value => value.timestamp).filter(Number.isFinite);
            const time = dates.length ? new Date(Math.min(...dates)).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }) : '';
            const issue = values.find(value => value.message)?.message;
            const label = document.createElement('span');
            label.textContent = `${name} – ${issue || (values.some(value => value.stale) ? 'kunde inte uppdateras' : time ? 'uppdaterad' : 'hämtar…')}${time ? ` ${time}` : ''}`;
            if (name === 'Trafiklab') label.title = 'Avgångsdata: Trafiklab, CC BY 4.0';
            footer.append(label);
        }
    };
    for (const name of ['Tibber', 'Open-Meteo', 'Trafiklab', 'TomTom', 'Outlook', 'Laget.se']) globalThis.reportDashboardUpdate(name, NaN);
})();
