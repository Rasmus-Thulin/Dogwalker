const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = {};
vm.runInNewContext(fs.readFileSync('display-awake.js', 'utf8').replace('export function', 'function') + '\nglobalThis.install = keepDisplayAwake;', context);
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(request, secure = true) {
    const events = {};
    const document = { visibilityState: 'visible', addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {} };
    const window = { isSecureContext: secure, addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {}, setInterval(fn) { events.timer = fn; return 1; }, clearInterval() {} };
    let status;
    const stop = context.install({ navigator: { wakeLock: { request } }, document, window, onStatus(value) { status = value; } });
    return { document, events, stop, status: () => status };
}
test('wake lock is coalesced, reacquired on return and never requested while hidden', async () => {
    let calls = 0;
    let released;
    const app = setup(async type => { assert.equal(type, 'screen'); calls++; return { addEventListener(name, fn) { released = fn; }, release: async () => {} }; });
    app.events.pointerdown();
    await settle();
    assert.equal(calls, 1);
    app.document.visibilityState = 'hidden';
    released();
    app.events.timer();
    assert.equal(calls, 1);
    app.document.visibilityState = 'visible';
    app.events.visibilitychange();
    await settle();
    assert.equal(calls, 2);
    app.stop();
});
test('plain HTTP on the tablet reports HTTPS requirement without requesting wake lock', () => {
    const app = setup(() => assert.fail('Wake lock must not be requested'), false);
    assert.match(app.status(), /HTTPS/);
});
test('system rejection is handled and retried on interaction', async () => {
    let calls = 0;
    const app = setup(async () => { calls++; throw new Error('Low battery'); });
    await settle();
    assert.match(app.status(), /energisparläget/);
    app.events.pointerdown();
    await settle();
    assert.equal(calls, 2);
    app.stop();
});
