const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCachedLoader, retryAfterSeconds } = require('./cached-loader');
const throttled = retryAfter => Object.assign(new Error('429'), { status: 429, retryAfter });

function clockCache(load) {
    let time = 1000000;
    const cache = createCachedLoader(load, { now: () => time, random: () => 0 });
    return { cache, advance: ms => { time += ms; }, now: () => time };
}

test('multiple clients share one refresh and the complete cached snapshot', async () => {
    let calls = 0;
    let release;
    const { cache, advance } = clockCache(() => { calls++; return new Promise(resolve => { release = resolve; }); });
    const first = cache.get();
    const second = cache.get();
    await Promise.resolve();
    assert.equal(calls, 1);
    release([{ id: 'car' }]);
    assert.deepEqual(await first, await second);
    await cache.get();
    assert.equal(calls, 1);
    advance(120001);
    const next = cache.get();
    await Promise.resolve();
    assert.equal(calls, 2);
    release([{ id: 'car', battery: 50 }]);
    assert.equal((await next).value[0].battery, 50);
});

test('429 retains the last snapshot and suppresses all upstream calls until Retry-After', async () => {
    let calls = 0;
    const { cache, advance } = clockCache(async () => { if (++calls > 1) throw throttled(600); return ['last good data']; });
    const original = await cache.get();
    advance(120001);
    const stale = await cache.get();
    assert.equal(stale.stale, true);
    assert.equal(stale.updatedAt, original.updatedAt);
    assert.deepEqual(stale.value, original.value);
    assert.equal(stale.retryAfter, 600);
    for (let index = 0; index < 10; index++) await cache.get();
    assert.equal(calls, 2);
    advance(599999);
    await cache.get();
    assert.equal(calls, 2);
    advance(1);
    assert.equal((await cache.get()).retryAfter, 600);
    assert.equal(calls, 3);
});

test('cold-cache 429 pauses and repeated 429s back off exponentially', async () => {
    let calls = 0;
    const { cache, advance } = clockCache(() => { calls++; throw throttled(); });
    await assert.rejects(cache.get(), error => error.status === 429 && error.retryAfter === 300);
    await assert.rejects(cache.get(), error => error.retryAfter === 300);
    assert.equal(calls, 1);
    advance(300000);
    await assert.rejects(cache.get(), error => error.retryAfter === 600);
    assert.equal(calls, 2);
});

test('successful recovery clears backoff and stale status', async () => {
    let fail = true;
    const { cache, advance } = clockCache(async () => { if (fail) throw throttled(); return ['recovered']; });
    await assert.rejects(cache.get());
    advance(300000);
    fail = false;
    const result = await cache.get();
    assert.equal(result.stale, false);
    assert.equal(result.retryAfter, 0);
});

test('reset discards previous account data and an in-flight previous response', async () => {
    let finish;
    const { cache } = clockCache(() => new Promise(resolve => { finish = resolve; }));
    const previous = cache.get();
    await Promise.resolve();
    cache.reset();
    finish(['previous account']);
    await assert.rejects(previous, error => error.status === 409);
    const current = cache.get();
    await Promise.resolve();
    finish(['current account']);
    assert.deepEqual((await current).value, ['current account']);
});

test('authentication failures are surfaced instead of returning stale data', async () => {
    let fail = false;
    const { cache, advance } = clockCache(async () => { if (fail) throw Object.assign(new Error('Reconnect'), { status: 401 }); return ['data']; });
    await cache.get();
    advance(120001);
    fail = true;
    await assert.rejects(cache.get(), error => error.status === 401);
});

test('Retry-After supports seconds, HTTP-date, expired dates and invalid values', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    assert.equal(retryAfterSeconds('600', now), 600);
    assert.equal(retryAfterSeconds('Sun, 08 Nov 2026 12:10:00 GMT', now), 600);
    assert.equal(retryAfterSeconds('Sun, 08 Nov 2026 11:10:00 GMT', now), 0);
    assert.equal(retryAfterSeconds('invalid', now), 0);
});

test('devices endpoint coalesces clients, stops a detail burst on 429 and serves stale data', async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    let time = Date.now();
    const routes = new Map();
    const app = { use() {}, get: (path, handler) => routes.set(path, handler), post() {}, listen() {} };
    const express = () => app;
    express.json = express.static = () => () => {};
    let calls = [];
    let failDetails = false;
    const mockFetch = async url => {
        calls.push(url);
        const detail = /\/devices\/car$/.test(url);
        const status = detail && failDetails ? 429 : 200;
        const body = status === 429 ? { error: 'Too many requests' } : /\/homes$/.test(url)
            ? { homes: [{ id: 'home' }] } : detail ? { device: { id: 'car', battery: 74 } }
                : { devices: [{ id: 'car' }, { id: 'car-two' }] };
        return { status, ok: status === 200, headers: { get: () => status === 429 ? '600' : null }, text: async () => JSON.stringify(body) };
    };
    const tokens = { refresh_token: 'test-refresh', access_token: 'test-access', expires_at: time + 3600000 };
    const requireMock = name => {
        if (name === 'dotenv') return { config() {} };
        if (name === 'express') return express;
        if (name === 'cors') return () => () => {};
        if (name === 'node-fetch') return mockFetch;
        if (name === 'fs') return { readFileSync: () => JSON.stringify(tokens) };
        if (name === './cached-loader') return { retryAfterSeconds, createCachedLoader: load => createCachedLoader(load, { now: () => time, random: () => 0 }) };
        return require(name);
    };
    vm.runInNewContext(fs.readFileSync('proxy-server.js', 'utf8'), { require: requireMock, process: { env: { NODE_ENV: 'production', TIBBER_CLIENT_ID: 'test', TIBBER_CLIENT_SECRET: 'test' } }, __dirname, console, URL, URLSearchParams, Buffer, Date });
    const response = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
    const handler = routes.get('/api/devices');
    const a = response(), b = response();
    await Promise.all([handler({}, a), handler({}, b)]);
    assert.equal(calls.length, 5); // homes, prices, device list and two details.
    assert.equal(a.body.devices.length, 2);
    assert.deepEqual(a.body, b.body);
    time += 120001;
    failDetails = true;
    const stale = response();
    await handler({}, stale);
    assert.equal(calls.length, 9); // homes, prices, list, first detail; second detail is never called.
    assert.equal(stale.body.stale, true);
    assert.equal(stale.body.updatedAt, a.body.updatedAt);
    assert.equal(stale.headers['Retry-After'], '600');
    await handler({}, response());
    assert.equal(calls.length, 9);
});
