const test = require('node:test');
const assert = require('node:assert/strict');

const { getCurrentEnergyPrice } = require('./energy-price');

test('selects the current Tibber interval and includes third-party grid cost', () => {
    const result = getCurrentEnergyPrice({
        currency: 'SEK',
        items: [
            { time: '2026-11-08T19:45:00Z', consumption: { price: 1.2, thirdPartyPrice: 0.8 } },
            { time: '2026-11-08T20:00:00Z', consumption: { price: 2, thirdPartyPrice: 1 } }
        ]
    }, new Date('2026-11-08T19:50:00Z').getTime());
    assert.deepEqual(result, {
        perKwh: 2,
        energyPrice: 1.2,
        gridPrice: 0.8,
        currency: 'SEK',
        time: '2026-11-08T19:45:00Z'
    });
});

test('prefers subsidized consumption price when supplied', () => {
    const result = getCurrentEnergyPrice({
        prices: [{ time: '2026-11-08T20:00:00Z', consumption: { price: 3, subsidizedPrice: 1.5 } }]
    }, new Date('2026-11-08T20:05:00Z').getTime());
    assert.equal(result.perKwh, 1.5);
});

test('does not stretch an old price across missing intervals or treat missing price as free', () => {
    const prices = [
        { time: '2026-11-08T19:00:00Z', consumption: { price: 1 } },
        { time: '2026-11-08T20:00:00Z', consumption: { price: 2 } }
    ];
    assert.equal(getCurrentEnergyPrice({ prices }, Date.parse('2026-11-08T19:30:00Z')), null);
    assert.equal(getCurrentEnergyPrice({ prices: [{ time: prices[0].time, consumption: {} }] }, Date.parse('2026-11-08T19:05:00Z')), null);
    assert.equal(getCurrentEnergyPrice({ prices: [{ time: prices[0].time, consumption: { price: 0 } }] }, Date.parse('2026-11-08T19:05:00Z')).perKwh, 0);
});
