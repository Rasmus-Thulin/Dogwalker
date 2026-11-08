const test = require('node:test');
const assert = require('node:assert/strict');
const { selectStop, selectDeparture, formatDeparture } = require('./transit-service');

test('selects the Ödåkra train station and Jupitergatan bus stop by mode', () => {
    const groups = [
        { id: 'bus', name: 'Ödåkra Jupitergatan', transport_modes: ['BUS'] },
        { id: 'train', name: 'Ödåkra station', transport_modes: ['TRAIN'] }
    ];
    assert.equal(selectStop(groups, { origin: 'Ödåkra station', mode: 'TRAIN' }).id, 'train');
    assert.equal(selectStop(groups, { origin: 'Ödåkra Jupitergatan', mode: 'BUS' }).id, 'bus');
});

test('selects only an uncancelled departure toward Helsingborg C', () => {
    const departures = [
        { canceled: false, route: { transport_mode: 'BUS', designation: '5', direction: 'Ödåkra' } },
        { canceled: true, route: { transport_mode: 'BUS', designation: '5', direction: 'Helsingborg Centralstation' } },
        { canceled: false, route: { transport_mode: 'BUS', designation: '5', direction: 'Helsingborg Centralstation' } }
    ];
    const selected = selectDeparture(departures, { mode: 'BUS', line: '5', destination: 'Helsingborg C' });
    assert.equal(selected, departures[2]);
});

test('matches a train whose direction and destination use different Helsingborg names', () => {
    const departure = {
        canceled: false,
        route: {
            transport_mode: 'TRAIN',
            direction: 'Helsingborgs central',
            destination: { name: 'Helsingborg Centralstation' }
        }
    };
    assert.equal(selectDeparture([departure], { mode: 'TRAIN', destination: 'Helsingborg C' }), departure);
});

test('formats realtime departure details for the dashboard', () => {
    const result = formatDeparture({
        scheduled: '2026-11-08T10:00:00', realtime: '2026-11-08T10:03:00', delay: 180, is_realtime: true,
        route: { designation: '5', direction: 'Helsingborg C' }, realtime_platform: { designation: 'B' }
    }, { id: 'bus', origin: 'Ödåkra Jupitergatan', destination: 'Helsingborg C' });
    assert.equal(result.departure, '2026-11-08T10:03:00');
    assert.equal(result.delay, 180);
    assert.equal(result.platform, 'B');
});
