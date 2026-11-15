const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('footer groups consumers by provider, keeps the oldest update and retains it on failure', () => {
    const footer = { children: [], replaceChildren() { this.children = []; }, append(value) { this.children.push(value); } };
    const context = { document: { getElementById: () => footer, createElement: () => ({}) } };
    vm.runInNewContext(fs.readFileSync('source-updates.js', 'utf8'), context);
    const report = context.reportDashboardUpdate;
    report('Laget.se', Date.parse('2026-11-14T21:40:00Z'), false, 'Melwin');
    report('Laget.se', Date.parse('2026-11-14T21:45:00Z'), false, 'Elliot');
    const label = () => footer.children.find(child => child.textContent.startsWith('Laget.se'));
    assert.equal(label().textContent, 'Laget.se – uppdaterad 22:40');
    report('Laget.se', NaN, true, 'Melwin');
    assert.equal(label().textContent, 'Laget.se – kunde inte uppdateras 22:40');
    assert.equal(footer.children.filter(child => child.textContent.startsWith('Laget.se')).length, 1);
});
