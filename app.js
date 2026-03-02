/**
 * Work Timer - 仕事用ビジュアルタイマー
 * Time Timer風の残時間可視化 + タスク管理 + インターバルタイマー
 */

// ===== State =====
const state = {
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    isRunning: false,
    isPaused: false,
    intervalId: null,
    currentTask: '',
    taskHistory: [],
    todayTotalSeconds: 0,
    selectedPreset: 25,
    startTimestamp: null,
    // Interval mode
    intervalMode: false,
    isBreak: false,
    breakMinutes: 5,
    workMinutes: 25,
    cycleCount: 0,
};

// ===== DOM Elements =====
const dom = {
    taskInput: document.getElementById('taskInput'),
    timerClock: document.getElementById('timerClock'),
    timerSvg: document.getElementById('timerSvg'),
    timerWedge: document.getElementById('timerWedge'),
    timerText: document.getElementById('timerText'),
    timerGlow: document.getElementById('timerGlow'),
    minuteMarks: document.getElementById('minuteMarks'),
    numberLabels: document.getElementById('numberLabels'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnReset: document.getElementById('btnReset'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    taskList: document.getElementById('taskList'),
    emptyState: document.getElementById('emptyState'),
    todayTotal: document.getElementById('todayTotal'),
    customMinutes: document.getElementById('customMinutes'),
    presetCustom: document.getElementById('presetCustom'),
    // Interval elements
    intervalToggle: document.getElementById('intervalToggle'),
    breakTimeInput: document.getElementById('breakTimeInput'),
    intervalStatus: document.getElementById('intervalStatus'),
    modeLabel: document.getElementById('modeLabel'),
};

// ===== Constants =====
const CENTER_X = 150;
const CENTER_Y = 150;
const RADIUS = 130;
const STORAGE_KEY = 'workTimer_data';

// ===== Initialize =====
function init() {
    loadData();
    // Initialize History Toggle
    const historyHeader = document.getElementById('historyHeader');
    const historySection = document.getElementById('historySection');

    // Load collapse state
    const isHistoryCollapsed = localStorage.getItem('historyCollapsed') === 'true';
    if (isHistoryCollapsed) {
        historySection.classList.add('collapsed');
    }

    historyHeader.addEventListener('click', () => {
        historySection.classList.toggle('collapsed');
        localStorage.setItem('historyCollapsed', historySection.classList.contains('collapsed'));
    });

    // Initialize Marks and Numbers
    drawClockFace();
    updateWedge();
    updateTimerDisplay();
    updateTodayTotal();
    renderTaskHistory();
    setupEventListeners();
    updateIntervalUI();
}

// ===== Clock Face Drawing =====
function drawClockFace() {
    const marksGroup = dom.minuteMarks;
    const labelsGroup = dom.numberLabels;
    marksGroup.innerHTML = '';
    labelsGroup.innerHTML = '';

    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const isMajor = i % 5 === 0;

        const outerR = RADIUS - 2;
        const innerR = isMajor ? RADIUS - 16 : RADIUS - 10;

        const x1 = CENTER_X + outerR * Math.cos(rad);
        const y1 = CENTER_Y + outerR * Math.sin(rad);
        const x2 = CENTER_X + innerR * Math.cos(rad);
        const y2 = CENTER_Y + innerR * Math.sin(rad);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        if (isMajor) line.classList.add('major');
        marksGroup.appendChild(line);

        if (isMajor) {
            const labelR = RADIUS - 26;
            const lx = CENTER_X + labelR * Math.cos(rad);
            const ly = CENTER_Y + labelR * Math.sin(rad);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', lx);
            text.setAttribute('y', ly);
            text.textContent = i === 0 ? '0' : i.toString();
            labelsGroup.appendChild(text);
        }
    }
}

// ===== Wedge (Pie) Drawing =====
function updateWedge() {
    const fraction = state.remainingSeconds / state.totalSeconds;

    if (fraction <= 0) {
        dom.timerWedge.setAttribute('d', '');
        return;
    }

    if (fraction >= 1) {
        dom.timerWedge.setAttribute('d',
            `M ${CENTER_X} ${CENTER_Y} ` +
            `m 0 -${RADIUS} ` +
            `a ${RADIUS} ${RADIUS} 0 1 1 0 ${2 * RADIUS} ` +
            `a ${RADIUS} ${RADIUS} 0 1 1 0 -${2 * RADIUS} Z`
        );
        updateWedgeColor(fraction);
        return;
    }

    const angle = fraction * 360;
    const startAngle = -90;
    const endAngle = startAngle + angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = CENTER_X + RADIUS * Math.cos(startRad);
    const y1 = CENTER_Y + RADIUS * Math.sin(startRad);
    const x2 = CENTER_X + RADIUS * Math.cos(endRad);
    const y2 = CENTER_Y + RADIUS * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const d = `M ${CENTER_X} ${CENTER_Y} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    dom.timerWedge.setAttribute('d', d);

    updateWedgeColor(fraction);
}

function updateWedgeColor(fraction) {
    dom.timerWedge.classList.remove('urgent', 'warning', 'break-mode');
    dom.timerClock.classList.remove('urgent', 'break-active');

    if (state.isBreak) {
        dom.timerWedge.classList.add('break-mode');
        dom.timerClock.classList.add('break-active');
        return;
    }

    if (fraction <= 0.1) {
        dom.timerWedge.classList.add('urgent');
        dom.timerClock.classList.add('urgent');
    } else if (fraction <= 0.25) {
        dom.timerWedge.classList.add('warning');
    }
}

// ===== Timer Display =====
function updateTimerDisplay() {
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = state.remainingSeconds % 60;
    const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    dom.timerText.textContent = display;

    if (state.isRunning || state.isPaused) {
        const modePrefix = state.isBreak ? '☕ ' : '';
        const taskLabel = state.currentTask ? ` - ${state.currentTask}` : '';
        document.title = `${modePrefix}${display}${taskLabel} | Work Timer`;
    } else {
        document.title = 'Work Timer - 仕事用タイマー';
    }
}

// ===== Interval Mode UI =====
function updateIntervalUI() {
    if (dom.intervalStatus) {
        dom.intervalStatus.classList.toggle('hidden', !state.intervalMode);
    }
    if (dom.breakTimeInput) {
        dom.breakTimeInput.disabled = !state.intervalMode;
        dom.breakTimeInput.style.opacity = state.intervalMode ? '1' : '0.4';
    }
    if (dom.intervalToggle) {
        dom.intervalToggle.checked = state.intervalMode;
    }
    updateModeLabel();
}

function updateModeLabel() {
    if (!dom.modeLabel) return;

    if (!state.isRunning && !state.isPaused) {
        dom.modeLabel.textContent = '';
        dom.modeLabel.className = 'mode-label';
        return;
    }

    if (state.isBreak) {
        dom.modeLabel.textContent = '☕ 休憩';
        dom.modeLabel.className = 'mode-label break';
    } else {
        dom.modeLabel.textContent = '🔥 集中';
        dom.modeLabel.className = 'mode-label work';
    }
}

// ===== Timer Controls =====
function startTimer() {
    if (state.remainingSeconds <= 0) return;

    state.currentTask = dom.taskInput.value.trim() || '名前なしタスク';
    state.isRunning = true;
    state.isPaused = false;
    state.isBreak = false;
    state.startTimestamp = Date.now();
    state.cycleCount = 0;

    dom.timerClock.classList.add('running');
    dom.timerClock.classList.remove('break-active');
    updateControlButtons();
    updateModeLabel();
    updateWedgeColor(1);

    runTimerInterval();
}

function runTimerInterval() {
    state.intervalId = setInterval(() => {
        state.remainingSeconds--;

        if (state.remainingSeconds <= 0) {
            state.remainingSeconds = 0;
            handleTimerComplete();
            return;
        }

        updateWedge();
        updateTimerDisplay();
    }, 1000);
}

function handleTimerComplete() {
    clearInterval(state.intervalId);

    if (state.intervalMode) {
        // Interval mode: auto-switch between work and break
        playTransitionSound(state.isBreak);

        if (state.isBreak) {
            // Break just finished → start work
            state.isBreak = false;
            state.totalSeconds = state.workMinutes * 60;
            state.remainingSeconds = state.totalSeconds;
            state.cycleCount++;

            dom.timerClock.classList.remove('break-active');
            updateWedgeColor(1);
            updateModeLabel();
            updateWedge();
            updateTimerDisplay();

            // Continue running
            runTimerInterval();
        } else {
            // Work just finished → record task and start break
            recordTask(state.currentTask, state.workMinutes * 60);

            state.isBreak = true;
            state.totalSeconds = state.breakMinutes * 60;
            state.remainingSeconds = state.totalSeconds;

            dom.timerClock.classList.add('break-active');
            updateWedgeColor(1);
            updateModeLabel();
            updateWedge();
            updateTimerDisplay();

            // Continue running
            runTimerInterval();
        }
    } else {
        // Normal mode: stop and show modal
        completeTimer();
    }
}

function pauseTimer() {
    if (!state.isRunning) return;

    clearInterval(state.intervalId);
    state.isRunning = false;
    state.isPaused = true;

    dom.timerClock.classList.remove('running');
    updateControlButtons();
}

function resumeTimer() {
    if (!state.isPaused) return;

    state.isRunning = true;
    state.isPaused = false;

    dom.timerClock.classList.add('running');
    updateControlButtons();

    runTimerInterval();
}

function resetTimer() {
    clearInterval(state.intervalId);

    // If was running or paused during WORK, record elapsed time
    if ((state.isRunning || state.isPaused) && state.startTimestamp && !state.isBreak) {
        const elapsedSeconds = state.totalSeconds - state.remainingSeconds;
        if (elapsedSeconds > 0) {
            recordTask(state.currentTask, elapsedSeconds);
        }
    }

    state.isRunning = false;
    state.isPaused = false;
    state.isBreak = false;
    state.cycleCount = 0;
    state.totalSeconds = state.workMinutes * 60;
    state.remainingSeconds = state.totalSeconds;
    state.startTimestamp = null;

    dom.timerClock.classList.remove('running', 'urgent', 'break-active');
    dom.timerWedge.classList.remove('break-mode', 'urgent', 'warning');
    updateControlButtons();
    updateWedge();
    updateTimerDisplay();
    updateModeLabel();
}

function completeTimer() {
    clearInterval(state.intervalId);
    state.isRunning = false;
    state.isPaused = false;

    dom.timerClock.classList.remove('running');

    recordTask(state.currentTask, state.totalSeconds);
    playCompletionSound();
    showCompletionModal();

    state.startTimestamp = null;
    updateModeLabel();
}

function recordTask(name, durationSeconds) {
    const now = new Date();
    const taskRecord = {
        name: name,
        duration: durationSeconds,
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('ja-JP'),
    };

    state.taskHistory.unshift(taskRecord);
    state.todayTotalSeconds += durationSeconds;

    saveData();
    updateTodayTotal();
    renderTaskHistory();
}

// ===== UI Updates =====
function updateControlButtons() {
    dom.btnStart.classList.toggle('hidden', state.isRunning || state.isPaused);
    dom.btnPause.classList.toggle('hidden', !state.isRunning);
    dom.btnResume.classList.toggle('hidden', !state.isPaused);
}

function updateTodayTotal() {
    dom.todayTotal.textContent = formatDuration(state.todayTotalSeconds);
}

function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatShortDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h}時間${rm}分`;
    }
    return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

// ===== Task History Rendering =====
function renderTaskHistory() {
    const taskTotals = {};
    state.taskHistory.forEach(task => {
        if (!taskTotals[task.name]) {
            taskTotals[task.name] = 0;
        }
        taskTotals[task.name] += task.duration;
    });

    if (state.taskHistory.length === 0) {
        dom.emptyState.style.display = 'flex';
        const items = dom.taskList.querySelectorAll('.task-item');
        items.forEach(item => item.remove());
        return;
    }

    dom.emptyState.style.display = 'none';

    const existingItems = dom.taskList.querySelectorAll('.task-item');
    existingItems.forEach(item => item.remove());

    state.taskHistory.forEach((task, index) => {
        const taskEl = createTaskElement(task, taskTotals[task.name]);
        dom.taskList.appendChild(taskEl);
    });
}

function createTaskElement(task, totalDuration) {
    const div = document.createElement('div');
    div.className = 'task-item';

    const timeStr = new Date(task.timestamp).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    });

    div.innerHTML = `
    <div class="task-item-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div class="task-item-info">
      <div class="task-item-name">${escapeHtml(task.name)}</div>
      <div class="task-item-time-info">
        <span>${timeStr}</span>
        <span>•</span>
        <span>${formatShortDuration(task.duration)}</span>
      </div>
    </div>
    <div class="task-item-duration">${formatDuration(task.duration)}</div>
    <div class="task-item-total" title="このタスクの合計時間">合計 ${formatDuration(totalDuration)}</div>
  `;

    return div;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== Preset Selection =====
function setPreset(minutes) {
    if (state.isRunning || state.isPaused) return;

    state.selectedPreset = minutes;
    state.workMinutes = minutes;
    state.totalSeconds = minutes * 60;
    state.remainingSeconds = minutes * 60;

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const presetBtn = document.querySelector(`.preset-btn[data-minutes="${minutes}"]`);
    if (presetBtn) {
        presetBtn.classList.add('active');
    }

    updateWedge();
    updateTimerDisplay();
}

// ===== Completion Modal =====
function showCompletionModal() {
    const overlay = document.createElement('div');
    overlay.className = 'timer-complete-overlay';
    overlay.id = 'completionOverlay';

    overlay.innerHTML = `
    <div class="timer-complete-modal">
      <h3>🎉 タイマー完了！</h3>
      <p>
        <span class="complete-task-name">${escapeHtml(state.currentTask)}</span><br>
        ${formatShortDuration(state.totalSeconds)}のタスクが完了しました
      </p>
      <button class="complete-btn" id="btnCompleteClose">OK</button>
    </div>
  `;

    document.body.appendChild(overlay);

    document.getElementById('btnCompleteClose').addEventListener('click', () => {
        overlay.remove();
        state.remainingSeconds = state.totalSeconds;
        updateWedge();
        updateTimerDisplay();
        updateControlButtons();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            state.remainingSeconds = state.totalSeconds;
            updateWedge();
            updateTimerDisplay();
            updateControlButtons();
        }
    });
}

// ===== Sound =====
function playCompletionSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.value = freq;
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.2);
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + i * 0.2 + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.2 + 0.5);
            oscillator.start(audioCtx.currentTime + i * 0.2);
            oscillator.stop(audioCtx.currentTime + i * 0.2 + 0.5);
        });
    } catch (e) {
        console.warn('Audio playback failed:', e);
    }
}

function playTransitionSound(wasBreak) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Different sound for work→break vs break→work
        const notes = wasBreak
            ? [392, 523.25, 659.25] // G4, C5, E5 (energetic - back to work)
            : [659.25, 523.25, 440]; // E5, C5, A4 (calming - going to break)

        notes.forEach((freq, i) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = wasBreak ? 'triangle' : 'sine';
            oscillator.frequency.value = freq;
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.15);
            gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + i * 0.15 + 0.04);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.4);
            oscillator.start(audioCtx.currentTime + i * 0.15);
            oscillator.stop(audioCtx.currentTime + i * 0.15 + 0.4);
        });
    } catch (e) {
        console.warn('Audio playback failed:', e);
    }
}

// ===== Data Persistence =====
function saveData() {
    const data = {
        taskHistory: state.taskHistory,
        todayTotalSeconds: state.todayTotalSeconds,
        lastDate: new Date().toLocaleDateString('ja-JP'),
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save data:', e);
    }
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const data = JSON.parse(raw);
        const today = new Date().toLocaleDateString('ja-JP');

        state.taskHistory = data.taskHistory || [];

        if (data.lastDate === today) {
            state.todayTotalSeconds = data.todayTotalSeconds || 0;
        } else {
            state.todayTotalSeconds = state.taskHistory
                .filter(t => t.date === today)
                .reduce((sum, t) => sum + t.duration, 0);
        }
    } catch (e) {
        console.warn('Failed to load data:', e);
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    dom.btnStart.addEventListener('click', startTimer);
    dom.btnPause.addEventListener('click', pauseTimer);
    dom.btnResume.addEventListener('click', resumeTimer);
    dom.btnReset.addEventListener('click', resetTimer);

    // Presets
    document.querySelectorAll('.preset-btn[data-minutes]').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            setPreset(minutes);
        });
    });

    // Custom preset
    dom.presetCustom.addEventListener('click', () => {
        const val = parseInt(dom.customMinutes.value);
        if (val && val > 0 && val <= 120) {
            setPreset(val);
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            dom.presetCustom.classList.add('active');
        }
    });

    dom.customMinutes.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            dom.presetCustom.click();
        }
    });

    // Start timer with Enter key in task input
    dom.taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.isRunning && !state.isPaused) {
            e.preventDefault();
            startTimer();
        }
    });

    // Interval mode toggle
    if (dom.intervalToggle) {
        dom.intervalToggle.addEventListener('change', () => {
            state.intervalMode = dom.intervalToggle.checked;
            updateIntervalUI();
        });
    }

    // Break time input
    if (dom.breakTimeInput) {
        dom.breakTimeInput.addEventListener('change', () => {
            const val = parseInt(dom.breakTimeInput.value);
            if (val && val > 0 && val <= 30) {
                state.breakMinutes = val;
            }
        });
    }

    // Clear history - double click to confirm
    if (dom.btnClearHistory) {
        let clearConfirmTimer = null;
        let clearConfirmed = false;

        dom.btnClearHistory.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (clearConfirmed) {
                clearConfirmed = false;
                if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
                dom.btnClearHistory.textContent = 'クリア';
                dom.btnClearHistory.style.background = '';
                dom.btnClearHistory.style.color = '';

                state.taskHistory = [];
                state.todayTotalSeconds = 0;
                saveData();
                updateTodayTotal();
                renderTaskHistory();
            } else {
                clearConfirmed = true;
                dom.btnClearHistory.textContent = '本当に削除？';
                dom.btnClearHistory.style.background = 'rgba(244,67,54,0.12)';
                dom.btnClearHistory.style.color = '#d32f2f';

                clearConfirmTimer = setTimeout(() => {
                    clearConfirmed = false;
                    dom.btnClearHistory.textContent = 'クリア';
                    dom.btnClearHistory.style.background = '';
                    dom.btnClearHistory.style.color = '';
                }, 3000);
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (state.isRunning) {
                pauseTimer();
            } else if (state.isPaused) {
                resumeTimer();
            } else {
                startTimer();
            }
        }

        if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
            resetTimer();
        }
    });

    // Before unload
    window.addEventListener('beforeunload', () => {
        if ((state.isRunning || state.isPaused) && !state.isBreak) {
            const elapsed = state.totalSeconds - state.remainingSeconds;
            if (elapsed > 0) {
                recordTask(state.currentTask, elapsed);
            }
        }
    });
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
