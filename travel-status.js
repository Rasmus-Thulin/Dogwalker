const updates = new Map();
export function reportTravelUpdate(source, timestamp, stale = false) {
    updates.set(source, { timestamp: Number(timestamp), stale });
    const status = document.getElementById('transitStatus');
    const values = [...updates.values()];
    const dates = values.map(value => value.timestamp).filter(Number.isFinite);
    status.textContent = dates.length ? `${values.some(value => value.stale) ? 'Senast hämtat' : 'Uppdaterad'} ${new Date(Math.min(...dates)).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}` : 'Reseinformation tillfälligt otillgänglig';
}
