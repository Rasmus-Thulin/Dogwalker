const calendars = document.getElementById('childrenCalendars');
const timezone = 'Europe/Stockholm';
const dateKey = date => date.toISOString().slice(0, 10);
const today = () => new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date())}T12:00:00Z`);
const shiftDay = (date, days) => new Date(date.getTime() + days * 86400000);
const monday = date => shiftDay(date, -((date.getUTCDay() + 6) % 7));
const format = (date, options) => new Intl.DateTimeFormat('sv-SE', { ...options, timeZone: 'UTC' }).format(date);
const weekNumber = start => {
    const thursday = shiftDay(start, 3);
    const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
    return 1 + Math.round((start - monday(first)) / 604800000);
};

for (const [index, name] of ['Melwin', 'Elliot'].entries()) {
    let offset = 0;
    let events = [];
    let loadedWeek = '';
    let note = 'Kontrollerar Outlook-kalender…';
    let requestVersion = 0;
    let retryAt = 0;
    const card = document.createElement('article');
    card.className = `child-calendar child-calendar-${index}`;
    card.setAttribute('aria-labelledby', `child-name-${index}`);
    card.innerHTML = `
        <header class="child-calendar-heading">
            <div class="child-calendar-person"><h2 id="child-name-${index}">${name}</h2></div>
            <nav class="child-calendar-navigation" aria-label="Välj vecka för ${name}">
                <button type="button" data-action="previous" aria-label="Föregående vecka">‹</button>
                <button type="button" data-action="today">Idag</button>
                <button type="button" data-action="next" aria-label="Nästa vecka">›</button>
            </nav>
        </header>
        <div class="child-calendar-period" aria-live="polite" aria-atomic="true"></div>
        <ol class="child-calendar-days"></ol>
        <p class="child-calendar-note">Ingen kalender ansluten ännu</p>`;
    const load = async (start, force = false) => {
        const week = dateKey(start);
        if (!force && week === loadedWeek && Date.now() < retryAt) return;
        const version = ++requestVersion;
        if (loadedWeek !== week) events = [];
        loadedWeek = week;
        retryAt = Date.now() + 300000;
        note = 'Hämtar från Outlook…';
        try {
            const response = await fetch(`/api/calendars/${name.toLowerCase()}?start=${week}`);
            if (!response.ok) throw new Error('Calendar unavailable');
            const result = await response.json();
            if (version !== requestVersion) return;
            events = result.events || [];
            const sources = result.sources?.join(' + ') || 'Outlook';
            note = !result.configured ? 'Ingen kalender ansluten ännu' : result.stale
                ? `${sources} · Vissa kalendrar kunde inte uppdateras`
                : `${sources} · Uppdaterad ${new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(result.updatedAt))}`;
        } catch {
            if (version !== requestVersion) return;
            note = events.length ? 'Kalendrarna kunde inte uppdateras · Visar sparade aktiviteter' : 'Kunde inte hämta kalendrarna';
            retryAt = Date.now() + 60000;
        }
        render();
    };
    const render = () => {
        const current = today();
        const start = shiftDay(monday(current), offset * 7);
        const end = shiftDay(start, 6);
        void load(start);
        card.querySelector('.child-calendar-note').textContent = note;
        card.querySelector('.child-calendar-period').textContent = `Vecka ${weekNumber(start)} · ${format(start, { day: 'numeric', month: 'short' })} – ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        const days = card.querySelector('.child-calendar-days');
        days.replaceChildren();
        for (let i = 0; i < 7; i++) {
            const date = shiftDay(start, i);
            const isToday = dateKey(date) === dateKey(current);
            const day = document.createElement('li');
            day.className = `child-calendar-day${isToday ? ' is-today' : ''}${i > 4 ? ' is-weekend' : ''}`;
            const time = document.createElement('time');
            time.dateTime = dateKey(date);
            if (isToday) time.setAttribute('aria-current', 'date');
            time.setAttribute('aria-label', format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
            const weekday = document.createElement('span');
            weekday.className = 'child-calendar-weekday';
            weekday.textContent = format(date, { weekday: 'short' }).replace('.', '');
            const number = document.createElement('strong');
            number.textContent = date.getUTCDate();
            time.append(weekday, number);
            const empty = document.createElement('span');
            empty.className = 'child-calendar-empty';
            empty.textContent = '—';
            empty.setAttribute('aria-label', 'Inga aktiviteter att visa');
            const key = dateKey(date);
            const activities = events.filter(event => event.allDay
                ? key >= event.startDay && key < event.endDay
                : key >= event.startDay && key <= event.endDay && (key !== event.endDay || new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(event.end)) !== '00:00'));
            const agenda = document.createElement('div');
            agenda.className = 'child-calendar-agenda';
            if (activities.length) {
                agenda.tabIndex = 0;
                agenda.setAttribute('aria-label', `Aktiviteter ${format(date, { weekday: 'long', day: 'numeric', month: 'long' })}`);
                for (const event of activities) {
                    const item = document.createElement('div');
                    item.className = 'child-calendar-event';
                    const at = document.createElement('span');
                    at.textContent = event.allDay ? 'Hela dagen' : key > event.startDay ? 'Fortsätter' : new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(event.start));
                    const title = document.createElement('span');
                    title.textContent = event.source === 'laget.se'
                        ? event.title.replace(/\s+-\s+Ödåkra IF P-?\d{4}\s*$/i, '')
                        : event.title;
                    item.title = `${at.textContent} · ${event.title}${event.source ? ` · ${event.source}` : ''}`;
                    item.append(at, title);
                    agenda.append(item);
                }
            } else {
                agenda.append(empty);
            }
            day.append(time, agenda);
            days.append(day);
        }
    };
    card.querySelector('nav').addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        offset = action === 'today' ? 0 : offset + (action === 'next' ? 1 : -1);
        render();
    });
    calendars.append(card);
    render();
    // Keep the current day and week accurate on an always-on home display.
    setInterval(render, 60000);
}
