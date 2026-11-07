const $ = id => document.getElementById(id);
const fallbackLocation = { name: 'Ödåkra', latitude: 56.10412, longitude: 12.7477, timezone: 'Europe/Stockholm' };
let location = { ...fallbackLocation };
let locationGeneration = 0;
let weatherRequest;
let hasWeather = false;
let timeZone = location.timezone || 'Europe/Stockholm';
function updateClock() {
    const now = new Date();
    $('dashboardClock').textContent = now.toLocaleTimeString('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit' });
    $('dashboardClock').dateTime = now.toISOString();
    $('dashboardDate').textContent = now.toLocaleDateString('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' });
    $('dashboardDate').dateTime = now.toISOString();
}
function condition(code, day = true) {
    if (code === 0) return { name: day ? 'Clear skies' : 'Clear night', scene: day ? 'sunny' : 'night', icon: day ? '☀' : '☾' };
    if (code <= 3) return { name: code === 3 ? 'Cloudy' : 'Partly cloudy', scene: 'cloudy', icon: '☁' };
    if (code <= 48) return { name: 'Foggy', scene: 'fog', icon: '≋' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { name: 'Snow', scene: 'snow', icon: '❄' };
    if (code >= 95) return { name: 'Thunderstorms', scene: 'storm', icon: 'ϟ' };
    return { name: 'Rain', scene: 'rain', icon: '☂' };
}
function setAtmosphere(scene) {
    $('weatherWidget').dataset.weather = scene;
    const particles = document.querySelector('.weather-particles');
    particles.replaceChildren();
    if (['rain', 'snow', 'storm'].includes(scene)) {
        for (let index = 0; index < 28; index++) {
            const particle = document.createElement('i');
            particle.style.setProperty('--x', `${(index * 37) % 100}%`);
            particle.style.setProperty('--delay', `${-(index * 0.31)}s`);
            particles.appendChild(particle);
        }
    }
}
async function loadWeather() {
    weatherRequest?.abort();
    const controller = new AbortController();
    weatherRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    $('weatherLocation').textContent = location.name;
    $('weatherCity').value = location.name;
    try {
        const params = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude,
            current: 'temperature_2m,weather_code,is_day', hourly: 'temperature_2m,weather_code,is_day',
            daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '2', timeformat: 'unixtime' });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Weather unavailable');
        const data = await response.json();
        if (!Number.isFinite(data.current?.temperature_2m) || !data.hourly?.time?.length) throw new Error('Incomplete weather data');
        timeZone = data.timezone || timeZone;
        location.timezone = timeZone;
        updateClock();
        const current = condition(data.current.weather_code, Boolean(data.current.is_day));
        $('weatherTemperature').textContent = `${Math.round(data.current.temperature_2m)}°`;
        $('weatherCondition').textContent = current.name;
        $('weatherHighLow').textContent = `High ${Math.round(data.daily.temperature_2m_max[0])}° · Low ${Math.round(data.daily.temperature_2m_min[0])}°`;
        setAtmosphere(current.scene);
        $('weatherHourly').replaceChildren();
        const start = Math.max(0, data.hourly.time.findIndex(time => time >= data.current.time));
        for (let index = start; index < Math.min(start + 6, data.hourly.time.length); index++) {
            const hour = document.createElement('div');
            const label = document.createElement('span');
            label.textContent = new Date(data.hourly.time[index] * 1000).toLocaleTimeString('sv-SE', { timeZone, hour: '2-digit' });
            const forecast = condition(data.hourly.weather_code[index], Boolean(data.hourly.is_day[index]));
            const icon = document.createElement('span');
            icon.className = 'forecast-icon';
            icon.textContent = forecast.icon;
            icon.setAttribute('aria-label', forecast.name);
            const temperature = document.createElement('strong');
            temperature.textContent = `${Math.round(data.hourly.temperature_2m[index])}°`;
            hour.append(label, icon, temperature);
            $('weatherHourly').appendChild(hour);
        }
        hasWeather = true;
    } catch {
        if (weatherRequest !== controller) return;
        $('weatherCondition').textContent = hasWeather ? 'Weather update unavailable · showing last forecast' : 'Weather temporarily unavailable';
    } finally { clearTimeout(timeout); }
}
async function useDeviceLocation() {
    const generation = ++locationGeneration;
    $('weatherLocationStatus').textContent = 'Finding your location…';
    let nextLocation = { ...fallbackLocation };
    try {
        if (!navigator.geolocation) throw new Error('Location unavailable');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000
        }));
        // City-level precision is sufficient for weather; do not persist device coordinates.
        const latitude = Math.round(position.coords.latitude * 100) / 100;
        const longitude = Math.round(position.coords.longitude * 100) / 100;
        let name = 'Current location';
        try {
            const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude, longitude, localityLanguage: 'sv' })}`, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
                const place = await response.json();
                name = place.locality || place.city || name;
            }
        } catch { /* Weather can still use the device coordinates without a place name. */ }
        nextLocation = { name, latitude, longitude };
    } catch { /* Denied, timed out or unsupported location access falls back to Ödåkra. */ }
    if (generation !== locationGeneration) return;
    location = nextLocation;
    hasWeather = false;
    timeZone = location.timezone || 'Europe/Stockholm';
    $('weatherTemperature').textContent = '—°';
    $('weatherHourly').replaceChildren();
    $('weatherHighLow').textContent = 'High —° · Low —°';
    await loadWeather();
    if (generation === locationGeneration) $('weatherLocationStatus').textContent = location.name === fallbackLocation.name
        ? 'Using Ödåkra. Allow location access to show local weather.' : `Using ${location.name}.`;
}
$('useDeviceLocation').addEventListener('click', useDeviceLocation);
$('weatherLocationForm').addEventListener('submit', async event => {
    event.preventDefault();
    const city = $('weatherCity').value.trim();
    if (!city) return;
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    ++locationGeneration;
    $('weatherLocationStatus').textContent = 'Finding location…';
    try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' })}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error();
        const match = (await response.json()).results?.[0];
        if (!match) throw new Error();
        location = { name: match.name, latitude: match.latitude, longitude: match.longitude, timezone: match.timezone };
        hasWeather = false;
        $('weatherTemperature').textContent = '—°';
        $('weatherHourly').replaceChildren();
        $('weatherHighLow').textContent = 'High —° · Low —°';
        await loadWeather();
        $('weatherLocationStatus').textContent = hasWeather ? `Weather set to ${location.name}.` : 'Location found. Weather will retry shortly.';
    } catch { $('weatherLocationStatus').textContent = 'Could not find that location. Try a city name.'; }
    finally { button.disabled = false; }
});
$('fullscreenBtn').addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else $('fullscreenBtn').textContent = 'Use browser fullscreen';
    } catch { $('fullscreenBtn').textContent = 'Use browser fullscreen'; }
});
document.addEventListener('fullscreenchange', () => { $('fullscreenBtn').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
updateClock();
setInterval(updateClock, 1000);
loadWeather();
useDeviceLocation();
setInterval(loadWeather, 15 * 60 * 1000);
window.addEventListener('online', loadWeather);
