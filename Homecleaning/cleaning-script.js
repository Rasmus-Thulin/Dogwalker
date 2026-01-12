// ===== CONSTANTS =====
const FAMILY_MEMBERS = ['Alexandra', 'Jimmy', 'Emmy', 'Tilde'];
const DEFAULT_LOCATION = { latitude: 59.3293, longitude: 18.0686, label: 'Stockholm' };
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

// Default cleaning tasks with recurrence
const DEFAULT_TASKS = [
    { name: 'Dammsuga våning 1', interval: 7 * 24 * 60 * 60 * 1000, icon: '🧹' }, // 7 days
    { name: 'Dammsuga våning 2', interval: 7 * 24 * 60 * 60 * 1000, icon: '🧹' }, // 7 days
    { name: 'Städa köket', interval: 7 * 24 * 60 * 60 * 1000, icon: '🍳' }, // 7 days
    { name: 'Rengör badrummet', interval: 7 * 24 * 60 * 60 * 1000, icon: '�' }, // 7 days
    { name: 'Torka golv', interval: 7 * 24 * 60 * 60 * 1000, icon: '🧽' }, // 7 days
    { name: 'Tömma kattlådan', interval: 1 * 24 * 60 * 60 * 1000, icon: '🐱' }, // 1 day
    { name: 'Torka ytor i köket', interval: 7 * 24 * 60 * 60 * 1000, icon: '✨' }, // 7 days
    { name: 'Sortera sopor', interval: 7 * 24 * 60 * 60 * 1000, icon: '🗑️' }, // 7 days
];

// ===== DOM ELEMENTS =====
const upcomingTasks = document.getElementById('upcomingTasks');
const leaderboardList = document.getElementById('leaderboardList');
const lastTaskElement = document.getElementById('lastTask');
const completedCount = document.getElementById('completedCount');
const footerText = document.getElementById('footerText');
const fullscreenLink = document.getElementById('fullscreenLink');
const weatherBadge = document.getElementById('weatherBadge');
const addTaskButton = document.getElementById('addTaskButton');
const settingsButton = document.getElementById('settingsButton');

// ===== STATE =====
let weatherInterval = null;

// ===== INITIALIZATION =====
function init() {
    // Check and handle weekly reset
    checkWeeklyReset();

    // Initialize tasks if not exists
    if (!localStorage.getItem('cleaningTasks')) {
        initializeTasks();
    }

    // Set up event listeners
    addTaskButton.addEventListener('click', showAddTaskModal);
    settingsButton.addEventListener('click', showSettingsModal);
    footerText.addEventListener('click', handleFooterClick);
    fullscreenLink.addEventListener('click', toggleFullscreen);

    // Update UI
    updateTasksList();
    updateLeaderboard();
    updateLastTaskDisplay();
    updateCompletedCount();

    // Weather background
    initWeather();

    // Check for overdue tasks every minute
    setInterval(updateTasksList, 60000);
}

// ===== TASK MANAGEMENT =====
function initializeTasks() {
    const now = Date.now();
    const tasks = DEFAULT_TASKS.map((task, index) => ({
        id: `task-${index}`,
        name: task.name,
        icon: task.icon,
        interval: task.interval,
        nextDue: now + (index * 1 * 24 * 60 * 60 * 1000), // Stagger initial tasks by 1 day each
        assignee: FAMILY_MEMBERS[index % FAMILY_MEMBERS.length],
        completed: false
    }));

    localStorage.setItem('cleaningTasks', JSON.stringify(tasks));
    localStorage.setItem('completedTasks', JSON.stringify([]));
}

function getTasks() {
    const tasksData = localStorage.getItem('cleaningTasks');
    return tasksData ? JSON.parse(tasksData) : [];
}

function saveTasks(tasks) {
    localStorage.setItem('cleaningTasks', JSON.stringify(tasks));
}

function getCompletedTasks() {
    const data = localStorage.getItem('completedTasks');
    return data ? JSON.parse(data) : [];
}

function saveCompletedTasks(tasks) {
    localStorage.setItem('completedTasks', JSON.stringify(tasks));
}

function completeTask(taskId, cleaner) {
    const tasks = getTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const now = Date.now();

    // Save to completed tasks
    const completedTasks = getCompletedTasks();
    completedTasks.push({
        taskName: task.name,
        icon: task.icon,
        cleaner: cleaner,
        timestamp: now
    });
    saveCompletedTasks(completedTasks);

    // Update task with new due date
    task.nextDue = now + task.interval;
    task.assignee = cleaner;
    saveTasks(tasks);

    // Update UI
    updateTasksList();
    updateLeaderboard();
    updateLastTaskDisplay();
    updateCompletedCount();

    // Show notification
    showNotification(`${cleaner} har klarat: ${task.icon} ${task.name}! 🎉`);
}

function showCompleteTaskModal(taskId) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal modal-person';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.innerHTML = `${task.icon} ${task.name}`;

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Vem gjorde uppgiften?';

    const personsGrid = document.createElement('div');
    personsGrid.className = 'persons-grid';

    const personIcons = {
        'Alexandra': '👩',
        'Jimmy': '👨',
        'Emmy': '👧',
        'Tilde': '🧒'
    };

    FAMILY_MEMBERS.forEach(member => {
        const personBtn = document.createElement('button');
        personBtn.className = 'person-btn';
        personBtn.innerHTML = `
            <span class="person-icon">${personIcons[member]}</span>
            <span class="person-name">${member}</span>
        `;
        personBtn.onclick = () => {
            completeTask(taskId, member);
            closeModal(overlay);
        };

        personsGrid.appendChild(personBtn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-button modal-cancel modal-full-width';
    cancelBtn.textContent = 'Avbryt';
    cancelBtn.onclick = () => closeModal(overlay);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(personsGrid);
    modal.appendChild(cancelBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
}

function updateTasksList() {
    const tasks = getTasks();
    const now = Date.now();
    const showThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Filter tasks to show those due within 7 days or overdue
    const upcomingTasksFiltered = tasks.filter(task => {
        const timeUntilDue = task.nextDue - now;
        return timeUntilDue <= showThreshold; // Show if due within 7 days or overdue
    });

    // Sort by due date
    const sortedTasks = [...upcomingTasksFiltered].sort((a, b) => a.nextDue - b.nextDue);

    upcomingTasks.innerHTML = '';

    if (sortedTasks.length === 0) {
        upcomingTasks.innerHTML = '<div class="empty-state">🎉 Inga uppgifter på gång just nu! Bra jobbat!</div>';
        return;
    }

    sortedTasks.forEach(task => {
        const timeUntilDue = task.nextDue - now;
        const item = document.createElement('div');

        // Determine urgency class
        let urgencyClass = 'normal';
        if (timeUntilDue < 0) {
            urgencyClass = 'urgent';
        } else if (timeUntilDue < 12 * 60 * 60 * 1000) { // Less than 12 hours
            urgencyClass = 'soon';
        }

        item.className = `task-item ${urgencyClass}`;

        const timeText = getTimeUntilText(timeUntilDue);

        item.innerHTML = `
            <div class="task-left">
                <div class="task-name">${task.icon} ${task.name}</div>
                <div class="task-info">${timeText}</div>
            </div>
            <div class="task-right">
                <div class="task-assignee">${task.assignee}</div>
                <button class="complete-btn" onclick="showCompleteTaskModal('${task.id}')">Klar ✓</button>
            </div>
        `;

        upcomingTasks.appendChild(item);
    });
}

function getTimeUntilText(ms) {
    if (ms < 0) {
        const overdue = Math.abs(ms);
        const days = Math.floor(overdue / (1000 * 60 * 60 * 24));

        if (days > 0) {
            return `⚠️ Försenad med ${days} dag${days > 1 ? 'ar' : ''}`;
        } else {
            return '⚠️ Försenad (idag)';
        }
    }

    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (days > 0) {
        return `⏱️ ${days} dag${days > 1 ? 'ar' : ''} kvar`;
    } else {
        return '⏱️ Idag';
    }
}

// ===== ADD TASK MODAL =====
// Predefined quick cleaning tasks
const QUICK_TASKS = [
    { icon: '🧹', name: 'Dammsuga våning 1' },
    { icon: '🧹', name: 'Dammsuga våning 2' },
    { icon: '🍳', name: 'Städa köket' },
    { icon: '�', name: 'Rengör badrummet' },
    { icon: '🧽', name: 'Torka golv' },
    { icon: '🐱', name: 'Tömma kattlådan' },
    { icon: '✨', name: 'Torka ytor' },
    { icon: '🗑️', name: 'Sortera sopor' },
    { icon: '🧺', name: 'Tvätta' },
    { icon: '💨', name: 'Vädra' },
    { icon: '🪟', name: 'Putsa fönster' },
    { icon: '🌿', name: 'Vattna växter' },
    { icon: '📦', name: 'Plocka undan' },
    { icon: '🧴', name: 'Återfyll papper/tvål' },
];

function showAddTaskModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal modal-tasks';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '✅ Vad har du gjort?';

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Välj uppgift och sedan vem som gjorde den';

    const tasksGrid = document.createElement('div');
    tasksGrid.className = 'quick-tasks-grid';

    QUICK_TASKS.forEach(task => {
        const taskBtn = document.createElement('button');
        taskBtn.className = 'quick-task-btn';
        taskBtn.innerHTML = `
            <span class="quick-task-icon">${task.icon}</span>
            <span class="quick-task-name">${task.name}</span>
        `;
        taskBtn.onclick = () => showPersonSelector(task.icon, task.name, overlay);

        tasksGrid.appendChild(taskBtn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-button modal-cancel modal-full-width';
    cancelBtn.textContent = 'Avbryt';
    cancelBtn.onclick = () => closeModal(overlay);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(tasksGrid);
    modal.appendChild(cancelBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
}

function showPersonSelector(icon, taskName, previousOverlay) {
    // Close previous modal
    closeModal(previousOverlay);

    // Small delay before showing new modal
    setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal modal-person';

        const title = document.createElement('h2');
        title.className = 'modal-title';
        title.innerHTML = `${icon} ${taskName}`;

        const subtitle = document.createElement('p');
        subtitle.className = 'modal-subtitle';
        subtitle.textContent = 'Vem gjorde uppgiften?';

        const personsGrid = document.createElement('div');
        personsGrid.className = 'persons-grid';

        const personIcons = {
            'Alexandra': '👩',
            'Jimmy': '👨',
            'Emmy': '👧',
            'Tilde': '🧒'
        };

        FAMILY_MEMBERS.forEach(member => {
            const personBtn = document.createElement('button');
            personBtn.className = 'person-btn';
            personBtn.innerHTML = `
                <span class="person-icon">${personIcons[member]}</span>
                <span class="person-name">${member}</span>
            `;
            personBtn.onclick = () => {
                registerCompletedTask(icon, taskName, member);
                closeModal(overlay);
            };

            personsGrid.appendChild(personBtn);
        });

        const backBtn = document.createElement('button');
        backBtn.className = 'modal-button modal-cancel modal-full-width';
        backBtn.textContent = '← Tillbaka';
        backBtn.onclick = () => {
            closeModal(overlay);
            setTimeout(showAddTaskModal, 300);
        };

        modal.appendChild(title);
        modal.appendChild(subtitle);
        modal.appendChild(personsGrid);
        modal.appendChild(backBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(() => overlay.classList.add('show'), 10);
    }, 300);
}

function registerCompletedTask(icon, taskName, cleaner) {
    const now = Date.now();
    const tasks = getTasks();

    // Create a new task that will be added to the upcoming tasks list
    const newTask = {
        id: `task-${Date.now()}`,
        name: taskName,
        icon: icon,
        interval: 7 * 24 * 60 * 60 * 1000, // Default: 7 days (1 week)
        nextDue: now + (7 * 24 * 60 * 60 * 1000), // Due in 7 days
        assignee: cleaner,
        completed: false
    };

    tasks.push(newTask);
    saveTasks(tasks);

    // Update UI
    updateTasksList();

    // Show notification
    showNotification(`${icon} ${taskName} tillagd för ${cleaner}! 7 dagar deadline ✅`);
}

function addNewTask(name, icon, intervalDays, assignee) {
    const tasks = getTasks();
    const now = Date.now();

    const newTask = {
        id: `task-${Date.now()}`,
        name: name,
        icon: icon,
        interval: intervalDays * 24 * 60 * 60 * 1000,
        nextDue: now + (intervalDays * 24 * 60 * 60 * 1000),
        assignee: assignee,
        completed: false
    };

    tasks.push(newTask);
    saveTasks(tasks);

    updateTasksList();
    showNotification(`✅ Uppgift "${icon} ${name}" tillagd!`);
}

function closeModal(overlay) {
    overlay.classList.remove('show');
    setTimeout(() => document.body.removeChild(overlay), 300);
}

// ===== LEADERBOARD =====
function getLeaderboardData() {
    const completedTasks = getCompletedTasks();
    const leaderboard = {};

    // Initialize all family members with 0
    FAMILY_MEMBERS.forEach(member => {
        leaderboard[member] = 0;
    });

    // Count completed tasks per person
    completedTasks.forEach(task => {
        if (leaderboard[task.cleaner] !== undefined) {
            leaderboard[task.cleaner]++;
        }
    });

    // Convert to array and sort by count
    return Object.entries(leaderboard)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

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
        scoreLabel.textContent = entry.count === 1 ? 'uppgift' : 'uppgifter';

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

// ===== LAST TASK DISPLAY =====
function updateLastTaskDisplay() {
    const completedTasks = getCompletedTasks();

    if (completedTasks.length === 0) {
        lastTaskElement.textContent = 'Ingen uppgift klar än den här veckan';
        return;
    }

    const lastTask = completedTasks[completedTasks.length - 1];
    const timeAgo = getTimeAgo(lastTask.timestamp);

    lastTaskElement.innerHTML = `
        Senaste: <strong>${lastTask.cleaner}</strong> klarade ${lastTask.icon} ${lastTask.taskName} för ${timeAgo}
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

// ===== COMPLETED COUNT =====
function updateCompletedCount() {
    const completedTasks = getCompletedTasks();
    const count = completedTasks.length;

    completedCount.textContent = `${count} uppgift${count !== 1 ? 'er' : ''}`;
}

// ===== WEEKLY RESET =====
function getNextSundayAt23() {
    const now = new Date();
    const nextSunday = new Date(now);

    const daysUntilSunday = (7 - now.getDay()) % 7;
    if (daysUntilSunday === 0) {
        const todayAt2350 = new Date(now);
        todayAt2350.setHours(23, 50, 0, 0);

        if (now < todayAt2350) {
            return todayAt2350.getTime();
        } else {
            nextSunday.setDate(now.getDate() + 7);
        }
    } else {
        nextSunday.setDate(now.getDate() + daysUntilSunday);
    }

    nextSunday.setHours(23, 50, 0, 0);
    return nextSunday.getTime();
}

function checkWeeklyReset() {
    const now = Date.now();
    const savedResetTime = localStorage.getItem('cleaningResetTime');

    if (!savedResetTime) {
        const nextReset = getNextSundayAt23();
        localStorage.setItem('cleaningResetTime', nextReset.toString());
        return;
    }

    const resetTime = parseInt(savedResetTime);

    if (now >= resetTime) {
        // Reset completed tasks
        localStorage.setItem('completedTasks', JSON.stringify([]));

        const nextReset = getNextSundayAt23();
        localStorage.setItem('cleaningResetTime', nextReset.toString());

        showNotification('🏆 Ny vecka! Highscoren har återställts!');
    }
}

// ===== WEATHER =====
async function initWeather() {
    try {
        const coords = await getCoordinates();
        await fetchWeather(coords);

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

    return palette.find(p => p.codes.includes(code)) || { label: 'Väder okänt', emoji: '❔', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' };
}

function applyWeatherBackground(gradient) {
    const fallback = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    document.documentElement.style.setProperty('--weather-gradient', gradient || fallback);
}

// ===== NOTIFICATION =====
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1.5rem 2.5rem;
        border-radius: 16px;
        font-size: 1.3rem;
        font-weight: 700;
        box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4);
        z-index: 10001;
        animation: notificationPop 0.45s ease-out forwards;
        max-width: 90%;
        text-align: center;
    `;
    notification.textContent = message;

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

    setTimeout(() => {
        notification.style.animation = 'notificationFade 0.25s ease-out forwards';
        setTimeout(() => {
            document.body.removeChild(notification);
            document.head.removeChild(style);
        }, 300);
    }, 2500);
}

// ===== FOOTER RESET HANDLER =====
async function handleFooterClick() {
    const ok1 = await showConfirmModal('Vill du nollställa highscore?');
    if (!ok1) return;

    const ok2 = await showConfirmModal('Är du helt säker?');
    if (!ok2) return;

    localStorage.setItem('completedTasks', JSON.stringify([]));
    localStorage.removeItem('cleaningResetTime');

    showNotification('🔄 Highscoren har nollställts!');

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
        modal.className = 'modal';

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

        setTimeout(() => overlay.classList.add('show'), 10);

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

document.addEventListener('fullscreenchange', updateFullscreenText);
document.addEventListener('webkitfullscreenchange', updateFullscreenText);
document.addEventListener('mozfullscreenchange', updateFullscreenText);
document.addEventListener('MSFullscreenChange', updateFullscreenText);

function updateFullscreenText() {
    if (document.fullscreenElement || document.webkitFullscreenElement ||
        document.mozFullScreenElement || document.msFullscreenElement) {
        fullscreenLink.textContent = '❌ Stäng fullskärm';
    } else {
        fullscreenLink.textContent = '📱 Fullskärm';
    }
}

// ===== SETTINGS MODAL =====
function showSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal modal-settings';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '⚙️ Inställningar';

    // Tasks Section
    const tasksSection = createTasksSection();

    // Points Section
    const pointsSection = createPointsSection();

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-button modal-cancel modal-full-width';
    closeBtn.textContent = 'Stäng';
    closeBtn.onclick = () => closeModal(overlay);

    modal.appendChild(title);
    modal.appendChild(tasksSection);
    modal.appendChild(pointsSection);
    modal.appendChild(closeBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
}

function createTasksSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = '📋 Återkommande uppgifter';

    const tasksList = document.createElement('div');
    tasksList.id = 'settingsTasksList';

    const tasks = getTasks();
    tasks.forEach(task => {
        const item = createTaskSettingsItem(task);
        tasksList.appendChild(item);
    });

    // Add new task form
    const addForm = createAddTaskForm();

    section.appendChild(sectionTitle);
    section.appendChild(tasksList);
    section.appendChild(addForm);

    return section;
}

function createTaskSettingsItem(task) {
    const item = document.createElement('div');
    item.className = 'task-settings-item';
    item.dataset.taskId = task.id;
    item.style.flexDirection = 'column';
    item.style.alignItems = 'stretch';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); margin-bottom: var(--spacing-sm);';

    const left = document.createElement('div');
    left.className = 'task-settings-left';

    const name = document.createElement('span');
    name.className = 'task-settings-name';
    name.textContent = `${task.icon} ${task.name}`;

    left.appendChild(name);

    const right = document.createElement('div');
    right.className = 'task-settings-right';

    // Convert interval from ms to days
    const intervalDays = Math.round(task.interval / (24 * 60 * 60 * 1000));

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '30';
    input.value = intervalDays;
    input.className = 'interval-input';
    input.onchange = () => updateTaskInterval(task.id, parseInt(input.value));

    const label = document.createElement('span');
    label.className = 'interval-label';
    label.textContent = 'dagar';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-task-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.onclick = () => deleteTask(task.id);

    right.appendChild(input);
    right.appendChild(label);
    right.appendChild(deleteBtn);

    topRow.appendChild(left);
    topRow.appendChild(right);

    // Bottom row - assignee selector
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display: flex; gap: var(--spacing-sm); align-items: center;';

    const assigneeLabel = document.createElement('span');
    assigneeLabel.textContent = 'Ansvarig:';
    assigneeLabel.className = 'interval-label';
    assigneeLabel.style.flex = '0 0 auto';

    const assigneeSelect = document.createElement('select');
    assigneeSelect.className = 'modal-select';
    assigneeSelect.style.marginBottom = '0';
    assigneeSelect.style.flex = '1';
    assigneeSelect.style.padding = '0.4rem';

    FAMILY_MEMBERS.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        if (member === task.assignee) {
            option.selected = true;
        }
        assigneeSelect.appendChild(option);
    });

    assigneeSelect.onchange = () => updateTaskAssignee(task.id, assigneeSelect.value);

    bottomRow.appendChild(assigneeLabel);
    bottomRow.appendChild(assigneeSelect);

    item.appendChild(topRow);
    item.appendChild(bottomRow);

    return item;
}

function createAddTaskForm() {
    const form = document.createElement('div');
    form.className = 'add-task-form';

    const formTitle = document.createElement('h4');
    formTitle.className = 'settings-section-title';
    formTitle.textContent = '➕ Lägg till ny uppgift';
    formTitle.style.fontSize = '0.95rem';
    formTitle.style.marginTop = 'var(--spacing-lg)';

    const inputs = document.createElement('div');
    inputs.className = 'add-task-inputs';

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.placeholder = '🧹';
    iconInput.className = 'icon-input';
    iconInput.id = 'newTaskIcon';
    iconInput.maxLength = 2;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Uppgiftens namn';
    nameInput.className = 'modal-input';
    nameInput.id = 'newTaskName';
    nameInput.style.marginBottom = '0';

    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.placeholder = '7';
    intervalInput.min = '1';
    intervalInput.max = '30';
    intervalInput.value = '7';
    intervalInput.className = 'interval-input';
    intervalInput.id = 'newTaskInterval';

    inputs.appendChild(iconInput);
    inputs.appendChild(nameInput);
    inputs.appendChild(intervalInput);

    // Person selector
    const personRow = document.createElement('div');
    personRow.style.cssText = 'display: flex; gap: var(--spacing-sm); align-items: center; margin-top: var(--spacing-sm);';

    const personLabel = document.createElement('label');
    personLabel.textContent = 'Ansvarig:';
    personLabel.className = 'interval-label';
    personLabel.style.flex = '0 0 auto';

    const personSelect = document.createElement('select');
    personSelect.className = 'modal-select';
    personSelect.id = 'newTaskAssignee';
    personSelect.style.marginBottom = '0';
    personSelect.style.flex = '1';

    FAMILY_MEMBERS.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        personSelect.appendChild(option);
    });

    personRow.appendChild(personLabel);
    personRow.appendChild(personSelect);

    const addBtn = document.createElement('button');
    addBtn.className = 'add-task-btn';
    addBtn.textContent = '➕ Lägg till uppgift';
    addBtn.onclick = addNewRecurringTask;

    form.appendChild(formTitle);
    form.appendChild(inputs);
    form.appendChild(personRow);
    form.appendChild(addBtn);

    return form;
}

function updateTaskInterval(taskId, newIntervalDays) {
    if (newIntervalDays < 1 || newIntervalDays > 30) {
        showNotification('⚠️ Intervallet måste vara mellan 1-30 dagar');
        return;
    }

    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        task.interval = newIntervalDays * 24 * 60 * 60 * 1000;
        saveTasks(tasks);
        showNotification(`✅ ${task.icon} ${task.name} uppdaterad till ${newIntervalDays} dagar`);
        updateTasksList();
    }
}

function updateTaskAssignee(taskId, newAssignee) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        task.assignee = newAssignee;
        saveTasks(tasks);
        showNotification(`✅ ${task.icon} ${task.name} tilldelad till ${newAssignee}`);
        updateTasksList();
    }
}

function deleteTask(taskId) {
    const tasks = getTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex !== -1) {
        const task = tasks[taskIndex];
        tasks.splice(taskIndex, 1);
        saveTasks(tasks);

        // Remove from DOM
        const item = document.querySelector(`[data-task-id="${taskId}"]`);
        if (item) {
            item.style.opacity = '0';
            setTimeout(() => item.remove(), 300);
        }

        showNotification(`🗑️ ${task.icon} ${task.name} borttagen`);
        updateTasksList();
    }
}

function addNewRecurringTask() {
    const icon = document.getElementById('newTaskIcon').value.trim() || '📝';
    const name = document.getElementById('newTaskName').value.trim();
    const intervalDays = parseInt(document.getElementById('newTaskInterval').value) || 7;
    const assignee = document.getElementById('newTaskAssignee').value;

    if (!name) {
        showNotification('⚠️ Ange ett namn för uppgiften');
        return;
    }

    const tasks = getTasks();
    const now = Date.now();

    const newTask = {
        id: `task-${Date.now()}`,
        name: name,
        icon: icon,
        interval: intervalDays * 24 * 60 * 60 * 1000,
        nextDue: now + (intervalDays * 24 * 60 * 60 * 1000),
        assignee: assignee,
        completed: false
    };

    tasks.push(newTask);
    saveTasks(tasks);

    // Add to settings list
    const tasksList = document.getElementById('settingsTasksList');
    const item = createTaskSettingsItem(newTask);
    tasksList.appendChild(item);

    // Clear inputs
    document.getElementById('newTaskIcon').value = '';
    document.getElementById('newTaskName').value = '';
    document.getElementById('newTaskInterval').value = '7';
    // Reset to first person
    document.getElementById('newTaskAssignee').selectedIndex = 0;

    showNotification(`✅ ${icon} ${name} tillagd för ${assignee}!`);
    updateTasksList();
}

function createPointsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = '🏆 Hantera poäng';

    const pointsList = document.createElement('div');
    pointsList.className = 'points-list';

    const leaderboardData = getLeaderboardData();
    leaderboardData.forEach(entry => {
        const item = createPointsItem(entry.name, entry.count);
        pointsList.appendChild(item);
    });

    section.appendChild(sectionTitle);
    section.appendChild(pointsList);

    return section;
}

function createPointsItem(memberName, currentPoints) {
    const item = document.createElement('div');
    item.className = 'points-item';
    item.dataset.member = memberName;

    const name = document.createElement('span');
    name.className = 'points-name';
    name.textContent = memberName;

    const controls = document.createElement('div');
    controls.className = 'points-controls';

    const pointsValue = document.createElement('span');
    pointsValue.className = 'points-value';
    pointsValue.textContent = currentPoints;
    pointsValue.id = `points-${memberName}`;

    const buttons = document.createElement('div');
    buttons.className = 'points-buttons';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'points-btn minus';
    minusBtn.textContent = '-';
    minusBtn.onclick = () => adjustPoints(memberName, -1);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'points-btn';
    plusBtn.textContent = '+';
    plusBtn.onclick = () => adjustPoints(memberName, 1);

    buttons.appendChild(minusBtn);
    buttons.appendChild(plusBtn);

    controls.appendChild(pointsValue);
    controls.appendChild(buttons);

    item.appendChild(name);
    item.appendChild(controls);

    return item;
}

function adjustPoints(memberName, change) {
    const completedTasks = getCompletedTasks();
    const now = Date.now();

    if (change > 0) {
        // Add a fake completed task to increase points
        completedTasks.push({
            taskName: 'Manuell poängjustering',
            icon: '⭐',
            cleaner: memberName,
            timestamp: now
        });
    } else if (change < 0) {
        // Remove the most recent task for this member
        for (let i = completedTasks.length - 1; i >= 0; i--) {
            if (completedTasks[i].cleaner === memberName) {
                completedTasks.splice(i, 1);
                break;
            }
        }
    }

    saveCompletedTasks(completedTasks);

    // Update points display in settings modal
    const pointsElement = document.getElementById(`points-${memberName}`);
    if (pointsElement) {
        const newCount = completedTasks.filter(t => t.cleaner === memberName).length;
        pointsElement.textContent = newCount;
    }

    // Update main leaderboard
    updateLeaderboard();
    updateCompletedCount();
    updateLastTaskDisplay();

    showNotification(`${change > 0 ? '+1' : '-1'} poäng för ${memberName}`);
}

// ===== START APP =====
init();

