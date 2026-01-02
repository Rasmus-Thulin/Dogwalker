// ===== CONSTANTS =====
const WALK_INTERVAL = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
const FAMILY_MEMBERS = ['Rasmus', 'Maria', 'Melwin', 'Elliot'];

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

// ===== STATE =====
let countdownInterval = null;
let nextWalkTime = null;

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

    // Start countdown
    startCountdown();

    // Update leaderboard
    updateLeaderboard();

    // Update last walk display
    updateLastWalkDisplay();

    // Update feeding status
    updateFeedingStatus();
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

// ===== FOOTER RESET HANDLER =====
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
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Enter fullscreen
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', updateFullscreenText);
document.addEventListener('webkitfullscreenchange', updateFullscreenText);

function updateFullscreenText() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        fullscreenLink.textContent = '❌ Stäng fullskärm';
    } else {
        fullscreenLink.textContent = '📱 Fullskärm';
    }
}

// ===== START APP =====
init();
