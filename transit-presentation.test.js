const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('departure cards show only timetable status or signed deviation under the time', () => {
    const nodes = { '.transit-time': {}, '.transit-detail': {} };
    const card = { querySelector: selector => nodes[selector] };
    const context = { document: { getElementById: () => card } };
    const source = fs.readFileSync('transit.js', 'utf8').replace(/^import .*;\n/, '').split('async function refreshTransit')[0];
    vm.runInNewContext(source + '\nglobalThis.render = renderJourney;', context);
    for (const [delay, expected] of [[0, 'Enligt tidtabell'], [121, '+3 min'], [-61, '−2 min']]) {
        context.render('train', { departure: '2026-11-14T21:31:00Z', delay, platform: 'B', line: '1635' });
        assert.equal(nodes['.transit-detail'].textContent, expected);
        assert.notEqual(nodes['.transit-time'].textContent, '—');
    }
    context.render('bus', null);
    assert.equal(nodes['.transit-time'].textContent, '—');
    assert.match(nodes['.transit-detail'].textContent, /Ingen avgång/);
});
