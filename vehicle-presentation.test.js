const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8').replace(/^import .*;\n/, '').split('// Initiera dashboard')[0];
const context = {};
vm.runInNewContext(source + '\nglobalThis.Dashboard = ChargingDashboard;', context);
const dashboard = Object.create(context.Dashboard.prototype);

test('Tessan uses a white Model Y while retaining her own Tibber identity and metrics', () => {
    const tessan = dashboard.formatTibberDevice({ id: 'tessans-device', name: 'Tessan', capabilities: [
        { description: 'State of charge', value: 53, unit: '%' },
        { description: 'Estimated remaining driving range', value: 166, unit: 'km' },
        { description: 'Vehicle charging status', value: 'charging' }
    ] });
    const gullan = dashboard.formatTibberDevice({ id: 'gullans-device', name: 'Gullan', capabilities: [{ description: 'State of charge', value: 49, unit: '%' }] });
    assert.equal(tessan.id, 'tessans-device');
    assert.equal(tessan.name, 'Tessan');
    assert.equal(tessan.model, 'Tesla Model Y');
    assert.equal(tessan.sketchfabModelId, gullan.sketchfabModelId);
    assert.deepEqual(Array.from(tessan.paintColor), [0.8, 0.8, 0.8]);
    assert.deepEqual(Array.from(gullan.paintColor), [0.004, 0.004, 0.004]);
    assert.equal(tessan.metrics[0].value, 53);
    assert.equal(tessan.metrics[1].value, 166);
    assert.equal(tessan.metrics[2].value, 'charging');
    assert.equal(gullan.metrics[0].value, 49);
    assert.equal(tessan.postProcessing.bloomEnable, false);
    assert.equal(gullan.postProcessing, null);
    assert.equal(tessan.animationPose, null);
    assert.equal(tessan.hiddenObjects.length, 0);
});
