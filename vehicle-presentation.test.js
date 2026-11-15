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
    assert.equal(tessan.cameraDistanceScale, 0.34);
    assert.equal(gullan.cameraDistanceScale, 0.5);
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

test('camera waits for recenter to finish and frames each viewer only once', () => {
    let animationEnd;
    let fallback;
    let reads = 0;
    let moves = 0;
    context.setTimeout = callback => { fallback = callback; return 1; };
    context.clearTimeout = () => {};
    const api = {
        setEnableCameraConstraints() {},
        setFov: (fov, callback) => callback(),
        setCameraLookAtEndAnimationCallback: callback => { animationEnd = callback; },
        recenterCamera: callback => callback(null),
        getCameraLookAt: callback => { reads++; callback(null, { position: [0, -10, 2], target: [0, 0, 1] }); },
        setCameraLookAt: (position, target, duration, callback) => {
            moves++;
            assert.ok(position.every(Number.isFinite));
            assert.ok(Math.abs(Math.hypot(...position.map((coordinate, axis) => coordinate - target[axis])) - Math.sqrt(101) * 0.5) < 1e-10);
            callback();
        },
        setUserInteraction() {}
    };
    const viewer = { isConnected: true, parentElement: { style: { setProperty() {} } } };
    dashboard.frameVehicle(api, viewer, { cameraHeading: 0, cameraDistanceScale: 0.5 });
    assert.equal(reads, 0);
    animationEnd(null);
    assert.equal(reads, 1);
    fallback();
    assert.equal(moves, 1);
});
