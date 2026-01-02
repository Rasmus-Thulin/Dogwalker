// ===== CONSTANTS =====
const WALK_INTERVAL = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
const FAMILY_MEMBERS = ['Rasmus', 'Maria', 'Melwin', 'Elliot'];
const DEFAULT_LOCATION = { latitude: 59.3293, longitude: 18.0686, label: 'Stockholm' };
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

// ===== DOM ELEMENTS =====
const timerDisplay = document.getElementById('timerDisplay');
const hoursElement = document.getElementById('hours');
const minutesElement = document.getElementById('minutes');
const secondsElement = document.getElementById('seconds');
const timerStatus = document.getElementById('timerStatus');
const walkButton = document.getElementById('walkButton');
const leaderboardList = document.getElementById('leaderboardList');
const lastWalkElement = document.getElementById('lastWalk');
const footerText = document.getElementById('footerText');
const morningFeedButton = document.getElementById('morningFeedButton');
const eveningFeedButton = document.getElementById('eveningFeedButton');
const morningStatus = document.getElementById('morningStatus');
const eveningStatus = document.getElementById('eveningStatus');
const fullscreenLink = document.getElementById('fullscreenLink');
const weatherBadge = document.getElementById('weatherBadge');

// ===== STATE =====
let countdownInterval = null;
let nextWalkTime = null;
let editMode = false;
let touchStartY = 0;
let touchStartValue = 0;
let weatherInterval = null;

// ===== INITIALIZATION =====
function init() {
    // Check and handle weekly reset
    checkWeeklyReset();

    // Check and handle daily feeding reset
    checkDailyFeedingReset();

    // Load saved data or initialize
    loadSavedData();

    // Set up event listeners
    walkButton.addEventListener('click', handleWalkButtonClick);
    footerText.addEventListener('click', handleFooterClick);
    morningFeedButton.addEventListener('click', () => handleFeedingClick('morning'));
    eveningFeedButton.addEventListener('click', () => handleFeedingClick('evening'));
    fullscreenLink.addEventListener('click', toggleFullscreen);
    timerDisplay.addEventListener('click', toggleEditMode);

    // Touch events for time adjustment
    hoursElement.addEventListener('touchstart', (e) => handleTouchStart(e, 'hours'));
    hoursElement.addEventListener('touchmove', handleTouchMove);
    hoursElement.addEventListener('touchend', handleTouchEnd);
    
    minutesElement.addEventListener('touchstart', (e) => handleTouchStart(e, 'minutes'));
    minutesElement.addEventListener('touchmove', handleTouchMove);
    minutesElement.addEventListener('touchend', handleTouchEnd);
    
    secondsElement.addEventListener('touchstart', (e) => handleTouchStart(e, 'seconds'));
    secondsElement.addEventListener('touchmove', handleTouchMove);
    secondsElement.addEventListener('touchend', handleTouchEnd);

    // Start countdown
    startCountdown();

    // Update leaderboard
    updateLeaderboard();

    // Update last walk display
    updateLastWalkDisplay();

    // Update feeding status
    updateFeedingStatus();

    // Weather background
    initWeather();
}

// ===== WEATHER =====
async function initWeather() {
    try {
        const coords = await getCoordinates();
        await fetchWeather(coords);

        // Refresh periodically to keep background relevant
        if (!weatherInterval) {
            weatherInterval = setInterval(() => {
                fetchWeather(coords).catch(() => {
                    weatherBadge.textContent = 'Ingen väderdata just nu';
                    applyWeatherBackground(null);
                });
            }, WEATHER_REFRESH_MS);
        }
    } catch (err) {
        weatherBadge.textContent = 'Ingen väderdata just nu';
        applyWeatherBackground(null);
    }
}

function getCoordinates() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(DEFAULT_LOCATION);
            return;
        }

        const opts = { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 };
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    label: 'Din plats'
                });
            },
            () => resolve(DEFAULT_LOCATION),
            opts
        );
    });
}

async function fetchWeather({ latitude, longitude, label }) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('weather fetch failed');

    const data = await res.json();
    const current = data.current_weather;
    if (!current) throw new Error('no weather payload');

    const mapped = mapWeatherCode(current.weathercode);
    const temp = Math.round(current.temperature);
    const locationLabel = label || 'Vald plats';

    weatherBadge.textContent = `${mapped.emoji} ${mapped.label} ${temp}°C · ${locationLabel}`;
    applyWeatherBackground(mapped.gradient);
}

function mapWeatherCode(code) {
    const palette = [
        { codes: [0], label: 'Klart', emoji: '☀️', gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
        { codes: [1, 2], label: 'Lätt molnigt', emoji: '🌤️', gradient: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)' },
        { codes: [3], label: 'Mulet', emoji: '☁️', gradient: 'linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)' },
        { codes: [45, 48], label: 'Dimma', emoji: '🌫️', gradient: 'linear-gradient(135deg, #757f9a 0%, #d7dde8 100%)' },
        { codes: [51, 53, 55, 56, 57], label: 'Duggregn', emoji: '🌦️', gradient: 'linear-gradient(135deg, #7f7fd5 0%, #86a8e7 50%, #91eae4 100%)' },
        { codes: [61, 63, 65, 66, 67], label: 'Regn', emoji: '🌧️', gradient: 'linear-gradient(135deg, #373b44 0%, #4286f4 100%)' },
        { codes: [71, 73, 75, 77], label: 'Snö', emoji: '❄️', gradient: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' },
        { codes: [80, 81, 82], label: 'Skurar', emoji: '⛈️', gradient: 'linear-gradient(135deg, #4b79a1 0%, #283e51 100%)' },
        { codes: [95, 96, 99], label: 'Åska', emoji: '🌩️', gradient: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
    ];

    return palette.find(p => p.codes.includes(code)) || { label: 'Väder okänt', emoji: '❔', gradient: 'linear-gradient(135deg, #4f7cea 0%, #5563c1 100%)' };
}

function applyWeatherBackground(gradient) {
    const fallback = 'linear-gradient(135deg, #4f7cea 0%, #5563c1 100%)';
    document.documentElement.style.setProperty('--weather-gradient', gradient || fallback);
}

// ===== LOCAL STORAGE FUNCTIONS =====
function loadSavedData() {
    const savedNextWalkTime = localStorage.getItem('nextWalkTime');

    if (savedNextWalkTime) {
        nextWalkTime = parseInt(savedNextWalkTime);

        // Check if the saved time is in the past
        if (nextWalkTime < Date.now()) {
            // Reset to default interval
            nextWalkTime = Date.now() + WALK_INTERVAL;
            localStorage.setItem('nextWalkTime', nextWalkTime.toString());
        }
    } else {
        // Initialize with default interval
        nextWalkTime = Date.now() + WALK_INTERVAL;
        localStorage.setItem('nextWalkTime', nextWalkTime.toString());
    }

    // Initialize walks array if it doesn't exist
    if (!localStorage.getItem('walks')) {
        localStorage.setItem('walks', JSON.stringify([]));
    }
}

// ===== WEEKLY RESET FUNCTIONS =====
function getNextSundayAt23() {
    const now = new Date();
    const nextSunday = new Date(now);

    // Set to next Sunday
    const daysUntilSunday = (7 - now.getDay()) % 7;
    if (daysUntilSunday === 0) {
        // Today is Sunday, check if it's before or after 23:00
        const todayAt23 = new Date(now);
        todayAt23.setHours(23, 0, 0, 0);

        if (now < todayAt23) {
            // It's Sunday but before 23:00, so reset is today at 23:00
            return todayAt23.getTime();
        } else {
            // It's Sunday after 23:00, so next reset is next Sunday
            nextSunday.setDate(now.getDate() + 7);
        }
    } else {
        // Not Sunday, calculate next Sunday
        nextSunday.setDate(now.getDate() + daysUntilSunday);
    }

    nextSunday.setHours(23, 0, 0, 0);
    return nextSunday.getTime();
}

function checkWeeklyReset() {
    const now = Date.now();
    const savedResetTime = localStorage.getItem('nextResetTime');

    if (!savedResetTime) {
        // First time, set next reset time
        const nextReset = getNextSundayAt23();
        localStorage.setItem('nextResetTime', nextReset.toString());
        return;
    }

    const resetTime = parseInt(savedResetTime);

    if (now >= resetTime) {
        // Time to reset!
        localStorage.setItem('walks', JSON.stringify([]));

        // Calculate and save next reset time
        const nextReset = getNextSundayAt23();
        localStorage.setItem('nextResetTime', nextReset.toString());

        // Show notification
        showNotification('🏆 Veckan är slut! Highscoren har återställts!');
    }
}

// ===== FEEDING FUNCTIONS =====
function checkDailyFeedingReset() {
    const today = new Date();
    const lastFeedingDate = localStorage.getItem('lastFeedingDate');
    const todayStr = today.toDateString();

    if (lastFeedingDate !== todayStr) {
        // New day - reset feeding status
        localStorage.removeItem('morningFed');
        localStorage.removeItem('eveningFed');
        localStorage.removeItem('morningFedTime');
        localStorage.removeItem('eveningFedTime');
        localStorage.setItem('lastFeedingDate', todayStr);
    }
}

async function handleFeedingClick(mealTime) {
    const storageKey = mealTime === 'morning' ? 'morningFed' : 'eveningFed';
    const isFed = localStorage.getItem(storageKey) === 'true';

    if (!isFed) {
        // Mark as fed
        localStorage.setItem(storageKey, 'true');
        const timestamp = Date.now();
        localStorage.setItem(storageKey + 'Time', timestamp.toString());

        // Update UI
        updateFeedingStatus();

        // Show notification
        const message = mealTime === 'morning' ?
            '🌅 Rosie har fått frukost!' :
            '🌙 Rosie har fått kvällsmat!';
        showNotification(message);
    } else {
        const confirmReset = await showConfirmModal('Har hon inte fått mat?');
        if (!confirmReset) return;

        // Undo - remove fed status
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageKey + 'Time');

        // Update UI
        updateFeedingStatus();

        // Show notification
        const message = mealTime === 'morning' ?
            '↩️ Morgonmat återställd' :
            '↩️ Kvällsmat återställd';
        showNotification(message);
    }
}

function updateFeedingStatus() {
    const morningFed = localStorage.getItem('morningFed') === 'true';
    const eveningFed = localStorage.getItem('eveningFed') === 'true';

    // Update morning button
    if (morningFed) {
        morningFeedButton.classList.add('fed');
        morningStatus.textContent = 'Given ✓';
        const time = localStorage.getItem('morningFedTime');
        if (time) {
            const date = new Date(parseInt(time));
            const timeStr = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
            morningStatus.textContent = `Given ${timeStr}`;
        }
    } else {
        morningFeedButton.classList.remove('fed');
        morningStatus.textContent = 'Ej given';
    }

    // Update evening button
    if (eveningFed) {
        eveningFeedButton.classList.add('fed');
        eveningStatus.textContent = 'Given ✓';
        const time = localStorage.getItem('eveningFedTime');
        if (time) {
            const date = new Date(parseInt(time));
            const timeStr = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
            eveningStatus.textContent = `Given ${timeStr}`;
        }
    } else {
        eveningFeedButton.classList.remove('fed');
        eveningStatus.textContent = 'Ej given';
    }
}

function getWalks() {
    const walksData = localStorage.getItem('walks');
    return walksData ? JSON.parse(walksData) : [];
}

function addWalk(walker, timestamp) {
    const walks = getWalks();
    walks.push({ walker, timestamp });
    localStorage.setItem('walks', JSON.stringify(walks));
}

function getLeaderboardData() {
    const walks = getWalks();
    const leaderboard = {};

    // Initialize all family members with 0
    FAMILY_MEMBERS.forEach(member => {
        leaderboard[member] = 0;
    });

    // Count walks per person
    walks.forEach(walk => {
        if (leaderboard[walk.walker] !== undefined) {
            leaderboard[walk.walker]++;
        }
    });

    // Convert to array and sort by count
    return Object.entries(leaderboard)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

// ===== TIMER FUNCTIONS =====
function startCountdown() {
    // Clear any existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    // Update immediately
    updateTimerDisplay();

    // Update every second
    countdownInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    // Check for weekly reset on every update
    checkWeeklyReset();

    const now = Date.now();
    const timeRemaining = nextWalkTime - now;

    if (timeRemaining <= 0) {
        // Time's up!
        hoursElement.textContent = '00';
        minutesElement.textContent = '00';
        secondsElement.textContent = '00';
        timerStatus.textContent = '⏰ Det är dags att gå ut med Rosie!';
        timerStatus.classList.add('warning');
        return;
    }

    // Calculate hours, minutes, seconds
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    // Update display
    hoursElement.textContent = hours.toString().padStart(2, '0');
    minutesElement.textContent = minutes.toString().padStart(2, '0');
    secondsElement.textContent = seconds.toString().padStart(2, '0');

    // Update status based on time remaining
    if (timeRemaining < 15 * 60 * 1000) { // Less than 15 minutes
        timerStatus.textContent = '⚠️ Snart dags!';
        timerStatus.classList.add('warning');
    } else if (timeRemaining < 30 * 60 * 1000) { // Less than 30 minutes
        timerStatus.textContent = 'Snart dags att förbereda...';
        timerStatus.classList.remove('warning');
    } else {
        timerStatus.textContent = '';
        timerStatus.classList.remove('warning');
    }
}

function resetTimer() {
    nextWalkTime = Date.now() + WALK_INTERVAL;
    localStorage.setItem('nextWalkTime', nextWalkTime.toString());
    updateTimerDisplay();
}

// ===== BUTTON HANDLER =====
function handleWalkButtonClick() {
    // Get selected walker
    const selectedWalker = document.querySelector('input[name="walker"]:checked');

    if (!selectedWalker) {
        alert('Välj vem som går ut med hunden!');
        return;
    }

    const walker = selectedWalker.value;
    const timestamp = Date.now();

    // Save the walk
    addWalk(walker, timestamp);

    // Reset timer
    resetTimer();

    // Update leaderboard
    updateLeaderboard();

    // Update last walk display
    updateLastWalkDisplay();

    // Visual feedback
    walkButton.classList.add('clicked');
    setTimeout(() => {
        walkButton.classList.remove('clicked');
    }, 600);

    // Show confirmation
    showNotification(`${walker} har gått ut med Rosie! 🐾`);
}

// ===== LEADERBOARD FUNCTIONS =====
function updateLeaderboard() {
    const leaderboardData = getLeaderboardData();

    leaderboardList.innerHTML = '';

    leaderboardData.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item rank-${index + 1}`;

        const rank = document.createElement('div');
        rank.className = 'leaderboard-rank';
        rank.textContent = getRankEmoji(index);

        const name = document.createElement('div');
        name.className = 'leaderboard-name';
        name.textContent = entry.name;

        const score = document.createElement('div');
        score.className = 'leaderboard-score';

        const scoreValue = document.createElement('div');
        scoreValue.className = 'score-value';
        scoreValue.textContent = entry.count;

        const scoreLabel = document.createElement('div');
        scoreLabel.className = 'score-label';
        scoreLabel.textContent = entry.count === 1 ? 'promenad' : 'promenader';

        score.appendChild(scoreValue);
        score.appendChild(scoreLabel);

        item.appendChild(rank);
        item.appendChild(name);
        item.appendChild(score);

        leaderboardList.appendChild(item);
    });
}

function getRankEmoji(index) {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣'];
    return emojis[index] || `${index + 1}️⃣`;
}

// ===== LAST WALK DISPLAY =====
function updateLastWalkDisplay() {
    const walks = getWalks();

    if (walks.length === 0) {
        lastWalkElement.textContent = 'Ingen promenad registrerad än';
        return;
    }

    // Get the most recent walk
    const lastWalk = walks[walks.length - 1];
    const lastWalkDate = new Date(lastWalk.timestamp);

    const timeAgo = getTimeAgo(lastWalk.timestamp);

    lastWalkElement.innerHTML = `
        Senaste promenad: <strong>${lastWalk.walker}</strong> för ${timeAgo}
    `;
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) {
        return 'mindre än en minut sedan';
    } else if (minutes < 60) {
        return `${minutes} minut${minutes !== 1 ? 'er' : ''} sedan`;
    } else if (hours < 24) {
        return `${hours} timm${hours !== 1 ? 'ar' : 'e'} sedan`;
    } else {
        return `${days} dag${days !== 1 ? 'ar' : ''} sedan`;
    }
}

// ===== NOTIFICATION =====
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        color: white;
        padding: 1.5rem 2.5rem;
        border-radius: 16px;
        font-size: 1.3rem;
        font-weight: 700;
        box-shadow: 0 20px 60px rgba(79, 172, 254, 0.4);
        z-index: 1000;
        animation: notificationPop 0.45s ease-out forwards;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes notificationPop {
            0% { transform: translate(-50%, -50%) scale(0); }
            50% { transform: translate(-50%, -50%) scale(1.05); }
            100% { transform: translate(-50%, -50%) scale(0.95); }
        }
        @keyframes notificationFade {
            to { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 2 seconds
    setTimeout(() => {
        notification.style.animation = 'notificationFade 0.25s ease-out forwards';
        setTimeout(() => {
            document.body.removeChild(notification);
            document.head.removeChild(style);
        }, 300);
    }, 2000);
}

// ===== TIMER EDIT MODE =====
function toggleEditMode() {
    editMode = !editMode;
    
    if (editMode) {
        timerDisplay.classList.add('edit-mode');
        timerStatus.textContent = '👆 Dra på siffrorna för att justera';
        timerStatus.classList.add('edit-hint');
        // Pause countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    } else {
        timerDisplay.classList.remove('edit-mode');
        timerStatus.classList.remove('edit-hint');
        // Restart countdown
        startCountdown();
        showNotification('⏰ Tiden justerad!');
    }
}

let currentEditSegment = null;

function handleTouchStart(e, segment) {
    if (!editMode) return;
    
    e.preventDefault();
    currentEditSegment = segment;
    touchStartY = e.touches[0].clientY;
    
    const element = segment === 'hours' ? hoursElement : 
                   segment === 'minutes' ? minutesElement : secondsElement;
    touchStartValue = parseInt(element.textContent);
    
    element.classList.add('dragging');
}

function handleTouchMove(e) {
    if (!editMode || !currentEditSegment) return;
    
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY; // Reversed: drag up = increase
    const steps = Math.floor(deltaY / 20); // 20px per step
    
    let newValue = touchStartValue + steps;
    
    // Apply constraints
    if (currentEditSegment === 'hours') {
        newValue = Math.max(0, Math.min(23, newValue));
        hoursElement.textContent = newValue.toString().padStart(2, '0');
    } else if (currentEditSegment === 'minutes') {
        newValue = Math.max(0, Math.min(59, newValue));
        minutesElement.textContent = newValue.toString().padStart(2, '0');
    } else if (currentEditSegment === 'seconds') {
        newValue = Math.max(0, Math.min(59, newValue));
        secondsElement.textContent = newValue.toString().padStart(2, '0');
    }
    
    updateNextWalkTime();
}

function handleTouchEnd(e) {
    if (!editMode || !currentEditSegment) return;
    
    const element = currentEditSegment === 'hours' ? hoursElement : 
                   currentEditSegment === 'minutes' ? minutesElement : secondsElement;
    element.classList.remove('dragging');
    
    currentEditSegment = null;
}

function updateNextWalkTime() {
    const hours = parseInt(hoursElement.textContent);
    const minutes = parseInt(minutesElement.textContent);
    const seconds = parseInt(secondsElement.textContent);
    
    const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
    nextWalkTime = Date.now() + totalMs;
    localStorage.setItem('nextWalkTime', nextWalkTime.toString());
}

// ===== FOOTER RESET HANDLER =======
async function handleFooterClick() {
    const ok1 = await showConfirmModal('Vill du nollställa highscore?');
    if (!ok1) return;

    const ok2 = await showConfirmModal('Är du helt säker?');
    if (!ok2) return;

    const ok3 = await showConfirmModal('Fuska inte nu.');
    if (!ok3) return;

    // All confirmations passed - reset highscore
    localStorage.removeItem('walks');
    localStorage.removeItem('nextResetTime');

    // Show notification
    showNotification('🔄 Highscoren har nollställts!');

    // Reload to update everything
    setTimeout(() => {
        location.reload();
    }, 1500);
}

// ===== CUSTOM CONFIRM MODAL =====
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal modal-simple';

        const text = document.createElement('p');
        text.className = 'modal-message';
        text.textContent = message;

        const buttons = document.createElement('div');
        buttons.className = 'modal-buttons';

        const cancel = document.createElement('button');
        cancel.className = 'modal-button modal-cancel';
        cancel.textContent = 'Avbryt';
        cancel.onclick = () => close(false);

        const confirm = document.createElement('button');
        confirm.className = 'modal-button modal-confirm';
        confirm.textContent = 'OK';
        confirm.onclick = () => close(true);

        buttons.appendChild(cancel);
        buttons.appendChild(confirm);
        modal.appendChild(text);
        modal.appendChild(buttons);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Animate in
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);

        function close(val) {
            overlay.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
                resolve(val);
            }, 300);
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close(false);
            }
        });
    });
}

// ===== FULLSCREEN =====
function toggleFullscreen() {
    const elem = document.documentElement;
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement && 
        !document.mozFullScreenElement && !document.msFullscreenElement) {
        // Enter fullscreen
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        } else {
            showNotification('Fullskärm stöds ej i denna webbläsare');
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', updateFullscreenText);
document.addEventListener('webkitfullscreenchange', updateFullscreenText);
document.addEventListener('mozfullscreenchange', updateFullscreenText);
document.addEventListener('MSFullscreenChange', updateFullscreenText);

function updateFullscreenText() {
    if (document.fullscreenElement || document.webkitFullscreenElement || 
        document.mozFullScreenElement || document.msFullscreenElement) {
        fullscreenLink.textContent = '❌ Stäng fullskärm';
        document.documentElement.style.background = '#0f0f1e';
        document.body.style.background = '#0f0f1e';
    } else {
        fullscreenLink.textContent = '📱 Fullskärm';
        document.documentElement.style.background = '#0f0f1e';
        document.body.style.background = '#0f0f1e';
    }
}

// ===== START APP =====
init();
