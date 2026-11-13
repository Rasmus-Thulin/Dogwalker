function getRecords(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return payload.data ? getRecords(payload.data, keys) : [];
}

function getCurrentEnergyPrice(payload, now = Date.now()) {
    const prices = getRecords(payload, ['prices', 'items'])
        .filter(item => item?.time && item?.consumption)
        .sort((a, b) => new Date(a.time) - new Date(b.time));
    const current = prices.find((item, index) => {
        const start = new Date(item.time).getTime();
        const next = prices[index + 1] ? new Date(prices[index + 1].time).getTime() : start + 15 * 60 * 1000;
        return start <= now && now < next;
    });
    if (!current) return null;
    const consumption = current.consumption;
    const energyPrice = Number(consumption.subsidizedPrice ?? consumption.price);
    const gridPrice = Number(consumption.thirdPartyPrice) || 0;
    if (!Number.isFinite(energyPrice)) return null;
    return {
        perKwh: energyPrice + gridPrice,
        energyPrice,
        gridPrice,
        currency: current.currency || payload.currency || consumption.currency || 'SEK',
        time: current.time
    };
}

module.exports = { getCurrentEnergyPrice };
