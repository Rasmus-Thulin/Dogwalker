const { test } = require('node:test');
const assert = require('node:assert/strict');
const ical = require('node-ical');
const { eventsInRange, createCalendarService } = require('./calendar-service');
const parse = body => ical.sync.parseICS(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`);

test('weekly Outlook events respect Stockholm DST, exclusions and edited instances', () => {
    const parsed = parse(`BEGIN:VEVENT
UID:football
DTSTART;TZID=Europe/Stockholm:20261019T170000
DTEND;TZID=Europe/Stockholm:20261019T180000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Stockholm:20261102T170000
SUMMARY:Fotboll
END:VEVENT
BEGIN:VEVENT
UID:football
RECURRENCE-ID;TZID=Europe/Stockholm:20261109T170000
DTSTART;TZID=Europe/Stockholm:20261110T180000
DTEND;TZID=Europe/Stockholm:20261110T190000
SUMMARY:Ny träningstid
END:VEVENT`.replaceAll('\n', '\r\n'));
    const events = eventsInRange(parsed, new Date('2026-10-19'), new Date('2026-11-16'));
    assert.deepEqual(events.map(event => event.start), ['2026-10-19T15:00:00.000Z', '2026-10-26T16:00:00.000Z', '2026-11-10T17:00:00.000Z']);
    assert.equal(events[2].title, 'Ny träningstid');
});

test('all-day events retain their exclusive end date and cancelled events are hidden', () => {
    const events = eventsInRange(parse(`BEGIN:VEVENT\r\nUID:holiday\r\nDTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261116\r\nSUMMARY:Ledigt\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:cancelled\r\nDTSTART:20261113T130000Z\r\nDTEND:20261113T140000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT`), new Date('2026-11-09'), new Date('2026-11-16'));
    assert.equal(events.length, 1);
    assert.equal(events[0].allDay, true);
    assert.equal(events[0].startDay, '2026-11-13');
    assert.equal(events[0].endDay, '2026-11-16');
});

test('children use independent cached calendars without exposing subscription URLs', async () => {
    let calls = 0;
    const service = createCalendarService({ urls: { melwin: 'https://outlook.live.com/private/calendar.ics', elliot: '' }, fetchImpl: async () => {
        calls++;
        return { ok: true, text: async () => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR' };
    } });
    const from = new Date('2026-11-09');
    const to = new Date('2026-11-16');
    const [one, two] = await Promise.all([service.get('melwin', from, to), service.get('melwin', from, to)]);
    assert.equal(calls, 1);
    assert.equal(one.configured, true);
    assert.equal(two.configured, true);
    assert.ok(!JSON.stringify(one).includes('private'));
    assert.deepEqual(await service.get('elliot', from, to), { configured: false, events: [] });
    assert.equal(await service.get('unknown', from, to), null);
});

test('Outlook and team feeds merge, deduplicate and tolerate one unavailable source', async () => {
    const fixture = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:training\r\nDTSTART:20261113T160000Z\r\nDTEND:20261113T170000Z\r\nSUMMARY:Träning\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const urls = { elliot: [{ url: 'https://example.com/outlook', label: 'Outlook' }, { url: 'https://example.com/team', label: 'laget.se' }] };
    let calls = 0;
    const fetchImpl = async url => { calls++; return { ok: true, text: async () => fixture }; };
    const service = createCalendarService({ urls, fetchImpl });
    const from = new Date('2026-11-09');
    const to = new Date('2026-11-16');
    const result = await service.get('elliot', from, to);
    assert.equal(calls, 2);
    assert.equal(result.events.length, 1);
    assert.deepEqual(result.sources, ['Outlook', 'laget.se']);
    assert.equal(result.stale, false);
    const partial = createCalendarService({ urls, fetchImpl: async url => {
        if (url.endsWith('/outlook')) throw new Error('Offline');
        return { ok: true, text: async () => fixture };
    } });
    const degraded = await partial.get('elliot', from, to);
    assert.equal(degraded.stale, true);
    assert.equal(degraded.events.length, 1);
    assert.equal(degraded.events[0].source, 'laget.se');
});
