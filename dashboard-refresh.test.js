const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function dashboard(fetch) {
    let time = 1000000;
    const nodes = new Map();
    const document = { hidden: false, addEventListener() {}, getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {} });
        return nodes.get(id);
    } };
    class Clock extends Date { static now() { return time; } }
    const context = { document, Date: Clock, fetch, setInterval: callback => { context.tick = callback; return 1; }, clearInterval() {} };
    const source = fs.readFileSync('app.js', 'utf8').replace(/^import .*;\n/, '').split('// Initiera dashboard')[0];
    vm.runInNewContext(source + '\nglobalThis.Dashboard = ChargingDashboard;', context);
    const instance = Object.create(context.Dashboard.prototype);
    Object.assign(instance, { apiBase: '', refreshInterval: 60, fetchInProgress: false, nextDeviceFetchAt: 0, vehicles: [] });
    instance.formatTibberDevice = value => value;
    instance.displayDevices = values => { instance.vehicles = values; };
    return { instance, document, nodes, context, advance: ms => { time += ms; } };
}

test('the iPad does not poll while hidden', () => {
    const { instance, document, context } = dashboard();
    let calls = 0;
    instance.fetchData = () => calls++;
    instance.startAutoRefresh();
    document.hidden = true;
    context.tick();
    assert.equal(calls, 0);
    document.hidden = false;
    context.tick();
    assert.equal(calls, 1);
});

test('429 retries obey cooldown even if visibility/online triggers repeated refreshes', async () => {
    let calls = 0;
    const { instance, advance, nodes } = dashboard(async () => { calls++; return { ok: false, status: 429, json: async () => ({ error: '429', retryAfter: 600 }) }; });
    await instance.fetchData();
    assert.match(nodes.get('errorText').textContent, /updates paused/);
    for (let index = 0; index < 10; index++) await instance.fetchData();
    assert.equal(calls, 1);
    advance(599999);
    await instance.fetchData();
    assert.equal(calls, 1);
    advance(1);
    await instance.fetchData();
    assert.equal(calls, 2);
});

test('stale server data keeps the vehicles and displays the actual snapshot time', async () => {
    let calls = 0;
    const { instance, nodes } = dashboard(async () => { calls++; return { ok: true, json: async () => ({ devices: [{ id: 'car', category: 'Bil' }], updatedAt: 900000, stale: true, retryAfter: 300 }) }; });
    await instance.fetchData();
    assert.equal(instance.vehicles.length, 1);
    assert.equal(instance.lastDataUpdatedAt, 900000);
    assert.match(nodes.get('errorText').textContent, /Showing values from/);
    await instance.fetchData();
    assert.equal(calls, 1);
});
