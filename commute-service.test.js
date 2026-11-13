const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCommuteService } = require('./commute-service');

test('missing key makes no external calls and never invents travel times', async () => {
    const service = createCommuteService({ fetchImpl: () => assert.fail('External call') });
    assert.deepEqual(await service.get(), { configured: false });
});
test('car route uses live traffic, exact addresses and one shared refresh per five minutes', async () => {
    let clock = 1000000;
    let calls = [];
    const service = createCommuteService({ apiKey: 'test-secret', now: () => clock, fetchImpl: async value => {
        const url = new URL(value);
        calls.push(url);
        if (url.pathname.includes('/geocode/')) return { ok: true, json: async () => ({ results: [{ address: { streetNumber: decodeURIComponent(url.pathname).includes('Månskensgatan') ? '20' : '2' }, position: { lat: 56, lon: 12 } }] }) };
        assert.equal(url.searchParams.get('travelMode'), 'car');
        assert.equal(url.searchParams.get('traffic'), 'true');
        assert.equal(url.searchParams.get('departAt'), 'now');
        return { ok: true, json: async () => ({ routes: [{ summary: { travelTimeInSeconds: 4200, trafficDelayInSeconds: 120, lengthInMeters: 85000 } }] }) };
    } });
    const [first, second] = await Promise.all([service.get(), service.get()]);
    assert.equal(calls.length, 3);
    assert.equal(first.durationSeconds, 4200);
    assert.equal(second.delaySeconds, 120);
    assert.ok(!JSON.stringify(first).includes('test-secret'));
    clock += 299999;
    await service.get();
    assert.equal(calls.length, 3);
    clock += 2;
    await service.get();
    assert.equal(calls.length, 4);
});
test('geocoding rejects a street match without the requested house number', async () => {
    const service = createCommuteService({ apiKey: 'key', fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ address: {}, position: { lat: 56, lon: 12 } }] }) }) });
    await assert.rejects(service.get(), /exakta adressen/);
});

test('traffic line places slow and stopped sections by distance, merging overlaps by severity', () => {
    const { trafficSegments } = require('./commute-service');
    const route = { legs: [{ points: [0, 1, 2, 8, 10].map(longitude => ({ latitude: 0, longitude })) }], sections: [
        { sectionType: 'TRAFFIC', startPointIndex: 1, endPointIndex: 3, simpleCategory: 'JAM', magnitudeOfDelay: 1 },
        { sectionType: 'TRAFFIC', startPointIndex: 2, endPointIndex: 3, simpleCategory: 'JAM', magnitudeOfDelay: 3 }
    ] };
    const segments = trafficSegments(route);
    assert.deepEqual(segments.map(s => s.state), ['free', 'slow', 'stopped', 'free']);
    assert.ok(Math.abs(segments[1].start - .1) < .00001);
    assert.ok(Math.abs(segments[2].end - .8) < .00001);
    assert.equal(segments.at(-1).end, 1);
});
test('missing geometry has no traffic line; a clear route is blue, closures and stationary jams are red', () => {
    const { trafficSegments } = require('./commute-service');
    assert.deepEqual(trafficSegments({}), []);
    const legs = [{ points: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }] }];
    assert.equal(trafficSegments({ legs })[0].state, 'free');
    for (const section of [{ simpleCategory: 'ROAD_CLOSURE' }, { simpleCategory: 'JAM', effectiveSpeedInKmh: 0 }]) {
        assert.equal(trafficSegments({ legs, sections: [{ sectionType: 'TRAFFIC', startPointIndex: 0, endPointIndex: 1, ...section }] })[0].state, 'stopped');
    }
});
