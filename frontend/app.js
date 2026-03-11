/* ─── Firebase Firestore Real-Time Sync ─── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// ── REPLACE these values with your own Firebase project config ──
// Go to https://console.firebase.google.com → Your project → Project Settings → Your apps
const firebaseConfig = {
    apiKey: "AIzaSyDmsUmU9mh64sPgoHLQBqONfVtalv_BFtQ",
    authDomain: "priyanshtech-calendar-47470.firebaseapp.com",
    projectId: "priyanshtech-calendar-47470",
    storageBucket: "priyanshtech-calendar-47470.firebasestorage.app",
    messagingSenderId: "544366531653",
    appId: "1:544366531653:web:5929ed739aef301c0c7f2c",
    measurementId: "G-SW78QREYQ7"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const EVENTS_DOC = doc(db, "calendar", "shared-events");
let currentDate = new Date();
let events = {}; // Populated from Firestore; kept in sync via onSnapshot
let dragged = null;
let currentView = "month"; // "month" or "week"
let currentAttendees = []; // attendee emails for current modal session
/* ─── EmailJS Initialization ─── */
// IMPORTANT: Replace these with YOUR EmailJS credentials
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";     // From EmailJS dashboard > Account
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";     // From EmailJS dashboard > Email Services
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";   // From EmailJS dashboard > Email Templates
(function initEmailJS() {
    try {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        console.log("✅ EmailJS initialized");
    } catch (e) {
        console.warn("⚠️ EmailJS not loaded yet, emails won't send.", e);
    }
})();
/* ─── Past Date Helper ─── */
// Returns true only if the WHOLE DATE is strictly before today (day level)
function isPastDate(dateKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateKey + "T00:00:00");
    return d < today;
}
// Returns true if the given date+time is more than 1 minute in the past
function isPastDateTime(dateKey, time24) {
    if (!time24) return isPastDate(dateKey); // all-day: only check date
    const eventDt = new Date(dateKey + 'T' + time24 + ':00');
    const nowMinus1Min = new Date(Date.now() - 60000); // 1 minute grace period
    return eventDt < nowMinus1Min;
}

const modal = new bootstrap.Modal(document.getElementById("eventModal"));

/* ─── Sync Status Indicator ─── */
function showSyncStatus(status) {
    let el = document.getElementById('syncStatusBadge');
    if (!el) {
        el = document.createElement('div');
        el.id = 'syncStatusBadge';
        el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;transition:opacity 0.4s;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        document.body.appendChild(el);
    }
    if (status === 'saving') {
        el.style.cssText += 'background:#1a73e8;color:#fff;opacity:1;';
        el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;border:2px solid #fff;border-top-color:transparent;animation:spin 0.7s linear infinite;display:inline-block"></span> Saving…';
    } else if (status === 'saved') {
        el.style.cssText += 'background:#43a047;color:#fff;opacity:1;';
        el.innerHTML = '✅ Saved & synced';
        setTimeout(() => { el.style.opacity = '0'; }, 2500);
    } else if (status === 'error') {
        el.style.cssText += 'background:#e53935;color:#fff;opacity:1;';
        el.innerHTML = '⚠️ Sync failed – stored locally';
        setTimeout(() => { el.style.opacity = '0'; }, 4000);
    } else if (status === 'connected') {
        el.style.cssText += 'background:#43a047;color:#fff;opacity:1;';
        el.innerHTML = '🔗 Live sync active';
        setTimeout(() => { el.style.opacity = '0'; }, 3000);
    }
}
/* ─── Firestore Save ─── */
// _isSaving prevents the onSnapshot callback (triggered by our own write)
// from overwriting the local events object before the write promise resolves.
let _isSaving = false;
async function saveStorage() {
    _isSaving = true;
    showSyncStatus('saving');
    // Always mirror to localStorage immediately so we survive a Firestore failure
    localStorage.setItem('events', JSON.stringify(events));
    try {
        await setDoc(EVENTS_DOC, { data: JSON.stringify(events) });
        showSyncStatus('saved');
    } catch (err) {
        console.error('❌ Failed to save events to Firestore:', err);
        showSyncStatus('error');
    } finally {
        _isSaving = false;
    }
}
/* ─── Real-Time Listener ─── */
// Registered after the DOM is ready so renderCurrentView is guaranteed to exist.
// onSnapshot fires instantly when any device writes new data.
function startFirestoreListener() {
    onSnapshot(EVENTS_DOC, (snapshot) => {
        // Skip update if we just triggered this snapshot ourselves (race-condition guard)
        if (_isSaving) return;
        if (snapshot.exists()) {
            try {
                events = JSON.parse(snapshot.data().data || '{}');
            } catch (e) {
                events = {};
            }
        } else {
            // No document yet – seed from localStorage so existing events aren't lost
            const local = localStorage.getItem('events');
            if (local) {
                events = JSON.parse(local);
                // Push local data up to Firestore so other devices get it too
                setDoc(EVENTS_DOC, { data: local }).catch(console.error);
            } else {
                events = {};
            }
        }
        renderCurrentView();
        showSyncStatus('connected');
    }, (err) => {
        console.error('❌ Firestore listener error:', err);
        showSyncStatus('error');
        // Graceful fallback: use localStorage so the app still works offline
        events = JSON.parse(localStorage.getItem('events') || '{}');
        renderCurrentView();
    });
}
/* ─── Live Clock ─── */
function updateClock() {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    document.getElementById("liveClock").innerHTML = dateStr + "<br>" + timeStr;
}
setInterval(updateClock, 1000);
updateClock();
/* ─── Device Timezone Label ─── */
function getDeviceTzLabel() {
    const now = new Date();
    const offsetMins = -now.getTimezoneOffset();
    const sign = offsetMins >= 0 ? '+' : '-';
    const absH = String(Math.floor(Math.abs(offsetMins) / 60)).padStart(2, '0');
    const absM = String(Math.abs(offsetMins) % 60).padStart(2, '0');
    return `GMT${sign}${absH}:${absM}`;
}
/* ─── Duration Helper ─── */
function getDurationMins(duration) {
    const map = {
        "15 min": 15, "25 min": 25, "30 min": 30, "45 min": 45,
        "1 hr": 60, "1.5 hr": 90, "2 hr": 120, "2.5hr": 150,
        "3 hr": 180, "4 hr": 240, "All day": 1440
    };
    return map[duration] || 60;
}
/* ─── Short Time Format (e.g. "9a", "2:30p") ─── */
function formatShortTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h < 12 ? 'a' : 'p';
    const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}
/* ─── Snap time to nearest 15-min slot ─── */
function snapToSlot(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const snappedM = m < 8 ? 0 : m < 23 ? 15 : m < 38 ? 30 : m < 53 ? 45 : 0;
    const snappedH = m >= 53 ? (h + 1) % 24 : h;
    return `${String(snappedH).padStart(2, '0')}:${String(snappedM).padStart(2, '0')}`;
}
/* ─── Time Picker Helpers (3-column Hour/Min/AM-PM <-> 24h string) ─── */
function setStartTimePicker(timeStr24) {
    // timeStr24 like "09:30" or "" for all-day
    const h = document.getElementById('startHour');
    const m = document.getElementById('startMinute');
    const ap = document.getElementById('startAmPm');
    if (!h || !m || !ap) return;
    if (!timeStr24) { h.value = ''; m.value = '00'; ap.value = 'AM'; syncStartTimeHidden(); return; }
    const [hh, mm] = timeStr24.split(':').map(Number);
    // Find nearest minute option (00, 15, 30, 45)
    const snappedM = mm < 8 ? 0 : mm < 23 ? 15 : mm < 38 ? 30 : mm < 53 ? 45 : 0;
    ap.value = hh < 12 ? 'AM' : 'PM';
    const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    h.value = String(hour12);
    m.value = String(snappedM).padStart(2, '0');
    syncStartTimeHidden();
}
function getStartTime24h() {
    const h = parseInt(document.getElementById('startHour')?.value || '0', 10);
    const m = parseInt(document.getElementById('startMinute')?.value || '0', 10);
    const ap = document.getElementById('startAmPm')?.value || 'AM';
    if (!document.getElementById('startHour')?.value) return ''; // All-day
    let hour24 = h === 12 ? (ap === 'AM' ? 0 : 12) : (ap === 'PM' ? h + 12 : h);
    return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function syncStartTimeHidden() {
    const hidden = document.getElementById('eventStartTime');
    if (hidden) hidden.value = getStartTime24h();
}
function setReminderTimePicker(timeStr24) {
    const h = document.getElementById('reminderHour');
    const m = document.getElementById('reminderMinute');
    const ap = document.getElementById('reminderAmPm');
    if (!h || !m || !ap) return;
    if (!timeStr24) { h.value = ''; m.value = '00'; ap.value = 'AM'; syncReminderTimeHidden(); return; }
    const [hh, mm] = timeStr24.split(':').map(Number);
    const snappedM = mm < 8 ? 0 : mm < 23 ? 15 : mm < 38 ? 30 : mm < 53 ? 45 : 0;
    ap.value = hh < 12 ? 'AM' : 'PM';
    const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    h.value = String(hour12);
    m.value = String(snappedM).padStart(2, '0');
    syncReminderTimeHidden();
}
function getReminderTime24h() {
    const h = parseInt(document.getElementById('reminderHour')?.value || '0', 10);
    const m = parseInt(document.getElementById('reminderMinute')?.value || '0', 10);
    const ap = document.getElementById('reminderAmPm')?.value || 'AM';
    if (!document.getElementById('reminderHour')?.value) return '';
    let hour24 = h === 12 ? (ap === 'AM' ? 0 : 12) : (ap === 'PM' ? h + 12 : h);
    return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function syncReminderTimeHidden() {
    const hidden = document.getElementById('reminderTime');
    if (hidden) hidden.value = getReminderTime24h();
}

// Wire up live sync so hidden fields stay updated as user changes pickers
document.addEventListener('DOMContentLoaded', () => {
    ['startHour', 'startMinute', 'startAmPm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', syncStartTimeHidden);
    });
    ['reminderHour', 'reminderMinute', 'reminderAmPm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', syncReminderTimeHidden);
    });
});


/* ─── Render Current View ─── */
function renderCurrentView() {
    const calendar = document.getElementById("calendar");
    calendar.style.display = "";
    if (currentView === "week") {
        calendar.className = "";
        renderWeekView();
        // Wire prev/next for week view (advance by 7 days)
        document.getElementById("prevBtn").onclick = () => {
            currentDate.setDate(currentDate.getDate() - 7);
            renderCurrentView();
        };
        document.getElementById("nextBtn").onclick = () => {
            currentDate.setDate(currentDate.getDate() + 7);
            renderCurrentView();
        };
    } else {
        calendar.className = "calendar-grid";
        renderCalendar();
        // Wire prev/next for month view (advance by 1 month)
        document.getElementById("prevBtn").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCurrentView();
        };
        document.getElementById("nextBtn").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCurrentView();
        };
    }
    renderCategoryBar();
}

/* ─── Main Calendar (Month View) ─── */
function renderCalendar() {
    const calendar = document.getElementById("calendar");
    calendar.innerHTML = "";
    calendar.className = "calendar-grid";
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    document.getElementById("monthYear").innerText =
        currentDate.toLocaleString("default", { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // Weekday headers
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d, idx) => {
        let h = document.createElement("div");
        h.className = "calendar-weekday" + (idx === 0 || idx === 6 ? " weekend-header" : "");
        h.innerText = d;
        calendar.appendChild(h);
    });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        let empty = document.createElement("div");
        empty.className = "calendar-day empty";
        calendar.appendChild(empty);
    }

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
        let dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const past = isPastDate(dateKey);

        // Determine day of week for this date
        const dayOfWeek = new Date(year, month, day).getDay(); // 0=Sun, 6=Sat
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let div = document.createElement("div");
        div.className = "calendar-day" + (past ? " past-day" : "") + (isWeekend ? " weekend" : "");
        div.dataset.date = dateKey;

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            div.classList.add("today");
        }

        let dayNum = document.createElement("span");
        dayNum.className = "day-number";
        dayNum.innerText = day;
        div.appendChild(dayNum);

        if (events[dateKey]) {
            events[dateKey].forEach((ev, index) => {
                // An event is "past" if the whole day is past, OR if it's today and
                // the event's scheduled time (+ duration) has already elapsed.
                const evPast = past || isPastDateTime(dateKey, ev.startTime || null);

                let eDiv = document.createElement("div");
                eDiv.className = "event" + (evPast ? " past-event" : "");
                eDiv.style.background = ev.color;
                eDiv.dataset.color = ev.color || '#43a047'; // used by category highlight
                // Past events are not draggable
                eDiv.draggable = !evPast;
                const timePrefix = ev.startTime ? formatShortTime(ev.startTime) + ' ' : '';
                eDiv.innerHTML = `
                    <span><strong class="ev-time">${timePrefix}</strong>${ev.title}</span>
                    ${ev.reminder ? '<i class="bi bi-bell-fill"></i>' : ''}
                `;
                // Always allow clicking past events — opens in read-only mode
                eDiv.onclick = (e) => { e.stopPropagation(); openModal(dateKey, index); };
                if (!evPast) eDiv.ondragstart = () => dragged = { from: dateKey, index };
                div.appendChild(eDiv);
            });
        }

        // Past empty days: no click. Past days with events: click handled by event chips above.
        if (!past) {
            div.onclick = () => openModal(dateKey, null);
            div.ondragover = (e) => e.preventDefault();
            div.ondrop = () => {
                if (dragged) {
                    let moved = events[dragged.from].splice(dragged.index, 1)[0];
                    if (!events[dateKey]) events[dateKey] = [];
                    events[dateKey].push(moved);
                    saveStorage();
                    renderCalendar();
                }
            };
        }

        calendar.appendChild(div);
    }

    renderMiniCalendar();
    // Navigation is wired by renderCurrentView() — no need to re-wire here.
}

/* ─── Mini Calendar ─── */
let miniDate = new Date();
function renderMiniCalendar() {
    const container = document.getElementById("miniCalendar");
    const today = new Date();
    const y = miniDate.getFullYear();
    const m = miniDate.getMonth();
    const monthName = miniDate.toLocaleString("default", { month: "long" });
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const prevLastDate = new Date(y, m, 0).getDate();
    const days = ["S", "M", "T", "W", "T", "F", "S"];

    let html = `
        <div class="mini-cal">
            <div class="mini-cal-header">
                <span class="mini-cal-title">${monthName} ${y}</span>
                <div class="mini-cal-nav">
                    <button class="mini-nav-btn" id="miniPrev">&#8249;</button>
                    <button class="mini-nav-btn" id="miniNext">&#8250;</button>
                </div>
            </div>
            <div class="mini-cal-grid">
                ${days.map((d, idx) => `<div class="mini-day-name${idx === 0 || idx === 6 ? ' mini-weekend-name' : ''}">${d}</div>`).join("")}
    `;

    for (let i = 0; i < firstDay; i++)
        html += `<div class="mini-day other-month">${prevLastDate - firstDay + 1 + i}</div>`;

    for (let day = 1; day <= lastDate; day++) {
        const isToday = day === today.getDate() && m === today.getMonth() && y === today.getFullYear();
        const dow = new Date(y, m, day).getDay(); // 0=Sun, 6=Sat
        const isWknd = dow === 0 || dow === 6;
        html += `<div class="mini-day${isToday ? ' mini-today' : ''}${isWknd ? ' mini-weekend' : ''}">${day}</div>`;
    }

    const totalCells = firstDay + lastDate;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++)
        html += `<div class="mini-day other-month">${i}</div>`;
    html += `</div></div>`;
    container.innerHTML = html;

    document.getElementById("miniPrev").onclick = () => { miniDate.setMonth(miniDate.getMonth() - 1); renderMiniCalendar(); };
    document.getElementById("miniNext").onclick = () => { miniDate.setMonth(miniDate.getMonth() + 1); renderMiniCalendar(); };

    // Make days clickable to switch to Day View
    container.querySelectorAll('.mini-day:not(.other-month)').forEach(dayEl => {
        dayEl.onclick = () => {
            const selectedDate = new Date(y, m, parseInt(dayEl.innerText));
            renderDayView(selectedDate);
        };
    });
}

/* ─── Day View (Hourly Grid) ─── */
function renderDayView(dateObj) {
    const calendar = document.getElementById("calendar");
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    document.getElementById("monthYear").innerText = dateObj.toLocaleDateString("default", { month: 'long', day: 'numeric', year: 'numeric' });

    calendar.style.display = "block";
    calendar.className = "";
    calendar.innerHTML = "";

    const dayViewContainer = document.createElement("div");
    dayViewContainer.className = "day-view-container";

    const headerRow = document.createElement("div");
    headerRow.className = "day-view-header";

    const tzLabel = document.createElement("div");
    tzLabel.className = "day-view-tz";
    tzLabel.innerText = getDeviceTzLabel();

    const colHeader = document.createElement("div");
    colHeader.className = "day-view-col-header";

    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const today = new Date();
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    colHeader.innerHTML = `
        <span class="day-view-name ${isToday ? 'today-text' : ''}">${dayName}</span>
        <div class="day-view-number ${isToday ? 'today-circle' : ''}">${day}</div>
    `;
    headerRow.appendChild(tzLabel);
    headerRow.appendChild(colHeader);
    dayViewContainer.appendChild(headerRow);

    const gridBody = document.createElement("div");
    gridBody.className = "day-view-body";

    for (let i = 1; i <= 24; i++) {
        const hourRow = document.createElement("div");
        hourRow.className = "hour-row";

        const timeLabel = document.createElement("div");
        timeLabel.className = "time-label";

        if (i < 24) {
            const displayHour = i === 12 ? 12 : (i > 12 ? i - 12 : i);
            const ampm = i < 12 ? "AM" : "PM";
            timeLabel.innerText = `${displayHour} ${ampm}`;
        }

        const hourSlot = document.createElement("div");
        hourSlot.className = "hour-slot";
        hourSlot.dataset.hour = i - 1;
        hourSlot.onclick = () => {
            openModal(dateKey, null);
            // Set time AFTER openModal so it doesn't get cleared
            document.getElementById("eventStartTime").value = snapToSlot(`${String(i - 1).padStart(2, '0')}:00`);
        };
        hourRow.appendChild(timeLabel);
        hourRow.appendChild(hourSlot);
        gridBody.appendChild(hourRow);
    }
    const eventColumn = document.createElement("div");
    eventColumn.className = "day-events-layer";
    if (events[dateKey]) {
        events[dateKey].forEach((ev, index) => {
            if (!ev.startTime) return;
            let [hours, minutes] = ev.startTime.split(':').map(Number);
            let durationMins = getDurationMins(ev.duration);
            const topOffset = (hours * 60) + minutes;
            const eDiv = document.createElement("div");
            eDiv.className = "day-event";
            eDiv.style.background = ev.color || "#43a047";
            eDiv.style.top = `${topOffset}px`;
            eDiv.style.height = `${durationMins}px`;
            eDiv.innerHTML = `<strong>${ev.title}</strong><br><span>${ev.startTime}</span>`;
            eDiv.onclick = (e) => { e.stopPropagation(); openModal(dateKey, index); };
            eventColumn.appendChild(eDiv);
        });
    }
    gridBody.appendChild(eventColumn);
    dayViewContainer.appendChild(gridBody);
    calendar.appendChild(dayViewContainer);
    document.getElementById("prevBtn").onclick = () => { dateObj.setDate(dateObj.getDate() - 1); renderDayView(dateObj); };
    document.getElementById("nextBtn").onclick = () => { dateObj.setDate(dateObj.getDate() + 1); renderDayView(dateObj); };
}
/* ─── Week View (Google Calendar Style) ─── */
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}
function renderWeekView() {
    const calendar = document.getElementById("calendar");
    calendar.innerHTML = "";
    calendar.className = "";
    calendar.style.display = "block";
    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    // Header title
    const startMonth = weekStart.toLocaleString("default", { month: "long" });
    const endMonth = weekEnd.toLocaleString("default", { month: "long" });
    const startYear = weekStart.getFullYear();
    const endYear = weekEnd.getFullYear();
    let headerText;
    if (startMonth === endMonth && startYear === endYear) {
        headerText = `${startMonth} ${weekStart.getDate()}–${weekEnd.getDate()}, ${startYear}`;
    } else if (startYear === endYear) {
        headerText = `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${startYear}`;
    } else {
        headerText = `${startMonth} ${weekStart.getDate()}, ${startYear} – ${endMonth} ${weekEnd.getDate()}, ${endYear}`;
    }
    document.getElementById("monthYear").innerText = headerText;
    const container = document.createElement("div");
    container.className = "week-view-container";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // ── Sticky Header ──
    const header = document.createElement("div");
    header.className = "week-header";
    const tzCorner = document.createElement("div");
    tzCorner.className = "week-tz-corner";
    tzCorner.textContent = getDeviceTzLabel();
    header.appendChild(tzCorner);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        weekDays.push(d);
        const colH = document.createElement("div");
        colH.className = "week-col-header";
        const isToday = d.getTime() === today.getTime();
        const dayAbbr = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        const isWeekendCol = d.getDay() === 0 || d.getDay() === 6;
        if (isWeekendCol) colH.classList.add("wk-weekend-header");

        colH.innerHTML = `
            <span class="week-day-name ${isToday ? 'wk-today-text' : ''}">${dayAbbr}</span>
            <div class="week-day-number ${isToday ? 'wk-today-circle' : ''}">${d.getDate()}</div>
        `;
        header.appendChild(colH);
    }
    container.appendChild(header);
    // ── All-Day row ──
    const allDayRow = document.createElement("div");
    allDayRow.className = "week-allday-row";

    const allDayLabel = document.createElement("div");
    allDayLabel.className = "week-time-gutter allday-label";
    allDayLabel.textContent = "";
    allDayRow.appendChild(allDayLabel);

    for (let i = 0; i < 7; i++) {
        const d = weekDays[i];
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const cell = document.createElement("div");
        cell.className = "week-allday-cell";

        if (events[dateKey]) {
            events[dateKey].forEach((ev, index) => {
                if (ev.duration === "All day" || !ev.startTime) {
                    const chip = document.createElement("div");
                    chip.className = "week-allday-event";
                    chip.style.background = ev.color || "#43a047";
                    chip.textContent = ev.title;
                    chip.onclick = (e) => { e.stopPropagation(); openModal(dateKey, index); };
                    cell.appendChild(chip);
                }
            });
        }
        cell.onclick = () => openModal(dateKey, null);
        allDayRow.appendChild(cell);
    }
    container.appendChild(allDayRow);

    // ── Scrollable Body ──
    const body = document.createElement("div");
    body.className = "week-body";

    // Time grid rows
    const gridWrap = document.createElement("div");
    gridWrap.className = "week-grid-wrap";

    // Time gutter
    const gutter = document.createElement("div");
    gutter.className = "week-time-gutter-col";

    for (let h = 0; h < 24; h++) {
        const slot = document.createElement("div");
        slot.className = "week-time-slot";
        if (h > 0) {
            const displayHour = h === 12 ? 12 : (h > 12 ? h - 12 : h);
            const ampm = h < 12 ? "AM" : "PM";
            slot.textContent = `${displayHour} ${ampm}`;
        }
        gutter.appendChild(slot);
    }
    gridWrap.appendChild(gutter);

    // Day columns
    const nowForWeek = new Date();
    const nowHour = nowForWeek.getHours();
    const nowMin = nowForWeek.getMinutes();
    const nowTotalMin = nowHour * 60 + nowMin;

    for (let i = 0; i < 7; i++) {
        const d = weekDays[i];
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const isToday = d.getTime() === today.getTime();
        const isPastDay = d < today; // entire day is before today

        const col = document.createElement("div");
        const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
        col.className = `week-day-col ${isToday ? 'wk-today-col' : ''} ${isWeekendDay ? 'wk-weekend-col' : ''} ${isPastDay ? 'wk-past-col' : ''}`;

        // Background hour slots (for click targets + grid lines)
        for (let h = 0; h < 24; h++) {
            const hourCell = document.createElement("div");
            // Disable past hour slots: whole past days OR past hours in TODAY
            const slotTotalMin = h * 60;
            const isPastSlot = isPastDay || (isToday && slotTotalMin < nowTotalMin - 1);
            hourCell.className = "week-hour-cell" + (isPastSlot ? " wk-past-slot" : "");
            hourCell.dataset.hour = h;
            if (!isPastSlot) {
                hourCell.onclick = () => {
                    openModal(dateKey, null);
                };
            }
            col.appendChild(hourCell);
        }

        // Events overlay
        const evLayer = document.createElement("div");
        evLayer.className = "week-events-layer";

        if (events[dateKey]) {
            events[dateKey].forEach((ev, index) => {
                if (!ev.startTime || ev.duration === "All day") return;

                let [hours, minutes] = ev.startTime.split(':').map(Number);
                let durationMins = getDurationMins(ev.duration);
                const PX_PER_MIN = 1; // 60px per hour ÷ 60 min = 1px per minute

                const topPx = (hours * 60 + minutes) * PX_PER_MIN;
                const heightPx = Math.max(durationMins * PX_PER_MIN, 22);

                // Is this event in the past?
                const evTotalMin = hours * 60 + minutes;
                const evIsPast = isPastDay || (isToday && evTotalMin + durationMins <= nowTotalMin);

                // Build end-time string for display inside tall blocks
                const endTotalMin = evTotalMin + durationMins;
                const endH = Math.floor(endTotalMin / 60) % 24;
                const endM = endTotalMin % 60;
                const endTimeStr = formatShortTime(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`);
                const startTimeStr = formatShortTime(ev.startTime);

                const eDiv = document.createElement("div");
                eDiv.className = "week-event-block" + (evIsPast ? " wk-past-event" : "");
                // Add size class so CSS can style differently for large blocks
                if (durationMins >= 240) eDiv.classList.add('wk-ev-xl');
                else if (durationMins >= 120) eDiv.classList.add('wk-ev-lg');
                else if (durationMins >= 60) eDiv.classList.add('wk-ev-md');
                else eDiv.classList.add('wk-ev-sm');

                eDiv.style.background = ev.color || "#43a047";
                eDiv.dataset.color = ev.color || '#43a047';
                eDiv.style.top = `${topPx}px`;
                eDiv.style.height = `${heightPx}px`;

                // Richer content for tall events
                if (durationMins >= 60) {
                    eDiv.innerHTML = `
                        <span class="week-ev-title">${ev.title}</span>
                        <span class="week-ev-timerange">${startTimeStr} – ${endTimeStr}</span>
                        ${durationMins >= 120 ? `<span class="week-ev-duration">${ev.duration}</span>` : ''}
                    `;
                } else {
                    eDiv.innerHTML = `<span class="week-ev-title">${ev.title}</span><span class="week-ev-time">${startTimeStr}</span>`;
                }
                eDiv.onclick = (e) => { e.stopPropagation(); openModal(dateKey, index); };
                evLayer.appendChild(eDiv);
            });
        }

        col.appendChild(evLayer);
        gridWrap.appendChild(col);
    }

    body.appendChild(gridWrap);

    // Current time line
    const nowLine = document.createElement("div");
    nowLine.className = "week-now-line";
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const todayIdx = weekDays.findIndex(d => d.getTime() === today.getTime());
    if (todayIdx >= 0) {
        nowLine.style.top = `${nowMins}px`;
        // Position: left = gutter width + todayIdx * column width
        nowLine.style.left = `calc(56px + ${todayIdx} * ((100% - 56px) / 7))`;
        nowLine.style.width = `calc((100% - 56px) / 7)`;
        nowLine.innerHTML = '<div class="week-now-dot"></div>';
        gridWrap.appendChild(nowLine);
    }

    container.appendChild(body);
    calendar.appendChild(container);

    // Scroll to ~8 AM
    setTimeout(() => { body.scrollTop = 8 * 60; }, 50);

    // Navigation is wired by renderCurrentView() after renderWeekView() returns.
    renderMiniCalendar();
}

/* ─── Color Category Buttons ─── */
function setupColorButtons(selectedColor) {
    document.querySelectorAll(".color-cat-btn").forEach(btn => {
        btn.classList.remove("active-cat");
        if (btn.dataset.color === selectedColor) btn.classList.add("active-cat");

        btn.onclick = () => {
            document.querySelectorAll(".color-cat-btn").forEach(b => b.classList.remove("active-cat"));
            btn.classList.add("active-cat");
            document.getElementById("eventColor").value = btn.dataset.color;
        };
    });
}

/* ─── Reminder Toggle ─── */
function setupReminderToggle() {
    const chk = document.getElementById("eventReminder");
    const fields = document.getElementById("reminderFields");
    const eventDateEl = document.getElementById("eventDate");
    const reminderDateEl = document.getElementById("reminderDate");

    // Helper: today's date as YYYY-MM-DD string
    function todayKey() {
        const t = new Date();
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    }

    // Constrain reminder date: min = today, max = event date (no future-of-event selection)
    function updateReminderConstraints() {
        const evDate = eventDateEl.value;
        const today = todayKey();
        // min: today (can't set reminder in the past)
        reminderDateEl.setAttribute("min", today);
        if (evDate) {
            // max: event date (reminder must be on/before the event)
            reminderDateEl.setAttribute("max", evDate);
            // Clear if the current value is outside the new bounds
            if (reminderDateEl.value && reminderDateEl.value > evDate) {
                reminderDateEl.value = "";
            }
        } else {
            reminderDateEl.removeAttribute("max");
        }
    }

    fields.style.cssText = chk.checked ? "display:flex!important;" : "display:none!important;";
    chk.onchange = () => {
        fields.style.cssText = chk.checked ? "display:flex!important;" : "display:none!important;";
        if (chk.checked) {
            updateReminderConstraints();
        } else {
            // Clear reminder fields when unchecked
            reminderDateEl.value = "";
            setReminderTimePicker('');
        }
    };

    // Update constraints whenever event date changes
    eventDateEl.onchange = updateReminderConstraints;

    // Apply constraints now if reminder is already enabled
    if (chk.checked) updateReminderConstraints();
}

/* ─── Attendee Management ─── */
function renderAttendeeTags() {
    const tagsEl = document.getElementById("attendeeTags");
    if (!tagsEl) return;
    tagsEl.innerHTML = "";
    currentAttendees.forEach((email, i) => {
        const tag = document.createElement("span");
        tag.className = "attendee-tag";
        tag.innerHTML = `
            <span class="tag-email" title="${email}">${email}</span>
            <button class="tag-remove" data-idx="${i}" title="Remove">×</button>
        `;
        tag.querySelector(".tag-remove").onclick = (e) => {
            e.stopPropagation();
            currentAttendees.splice(i, 1);
            renderAttendeeTags();
        };
        tagsEl.appendChild(tag);
    });
}

function addAttendee(email) {
    email = email.trim().toLowerCase();
    if (!email) return;
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showEmailToast("❌ Invalid email: " + email, "error");
        return;
    }
    if (currentAttendees.includes(email)) {
        showEmailToast("⚠️ Already added: " + email, "error");
        return;
    }
    currentAttendees.push(email);
    renderAttendeeTags();
    document.getElementById("attendeeInput").value = "";
}

function setupAttendeeInput() {
    const input = document.getElementById("attendeeInput");
    const wrap = document.getElementById("attendeesWrap");
    if (!input || !wrap) return; // attendee section removed from HTML — skip

    // Focus input when clicking the wrapper
    wrap.onclick = () => input.focus();

    input.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addAttendee(input.value.replace(",", ""));
        }
        if (e.key === "Backspace" && input.value === "" && currentAttendees.length > 0) {
            currentAttendees.pop();
            renderAttendeeTags();
        }
    };

    // Also add on blur if there's text
    input.onblur = () => {
        if (input.value.trim()) addAttendee(input.value);
    };
}

/* ─── Meeting Link Generation ─── */
function generateMeetingLink() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const seg = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `https://meet.priyanshtech.com/${seg(3)}-${seg(4)}-${seg(3)}`;
}

function setupMeetingLink() {
    const genBtn = document.getElementById("generateLinkBtn");
    const copyBtn = document.getElementById("copyLinkBtn");
    const linkInput = document.getElementById("meetingLink");
    if (genBtn && linkInput) {
        genBtn.onclick = () => { linkInput.value = generateMeetingLink(); };
    }
    if (copyBtn && linkInput) {
        copyBtn.onclick = () => {
            const link = linkInput.value;
            if (!link) return;
            navigator.clipboard.writeText(link).then(() => {
                showEmailToast("📋 Meeting link copied!", "success");
            });
        };
    }
}
setupMeetingLink();

/* ─── Email Toast Notification ─── */
function showEmailToast(message, type) {
    // Remove existing toasts
    document.querySelectorAll(".email-toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = `email-toast toast-${type}`;

    let icon = "";
    if (type === "sending") icon = '<div class="toast-spinner"></div>';
    else if (type === "success") icon = '<i class="bi bi-check-circle-fill" style="color:#43a047;font-size:18px"></i>';
    else if (type === "error") icon = '<i class="bi bi-x-circle-fill" style="color:#e53935;font-size:18px"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    document.body.appendChild(toast);

    if (type !== "sending") {
        setTimeout(() => {
            toast.classList.add("toast-exit");
            setTimeout(() => toast.remove(), 350);
        }, 3500);
    }

    return toast;
}

/* ─── Send Email via EmailJS ─── */
async function sendEventEmails(ev, attendees) {
    if (!attendees || attendees.length === 0) return;

    const toastEl = showEmailToast(`📧 Sending invites to ${attendees.length} attendee(s)...`, "sending");

    const eventDate = new Date(ev.date + 'T00:00:00');
    const formattedDate = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const formattedTime = ev.startTime ? formatDisplayTime12(ev.startTime) : 'Not specified';

    let successCount = 0;
    let failCount = 0;

    for (const email of attendees) {
        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: email,
                event_title: ev.title,
                event_date: formattedDate,
                event_time: formattedTime,
                event_duration: ev.duration || 'Not specified',
                event_description: ev.notes || 'No description provided',
                meeting_link: ev.meetingLink || 'No meeting link',
                attendee_list: attendees.join(', '),
            });
            successCount++;
        } catch (err) {
            console.error(`Failed to send email to ${email}:`, err);
            failCount++;
        }
    }

    // Remove sending toast
    if (toastEl) toastEl.remove();

    if (failCount === 0) {
        showEmailToast(`✅ Invites sent to all ${successCount} attendee(s)!`, "success");
    } else if (successCount > 0) {
        showEmailToast(`⚠️ Sent to ${successCount}, failed for ${failCount} attendee(s)`, "error");
    } else {
        showEmailToast(`❌ Failed to send invites. Check EmailJS config.`, "error");
    }
}

/* ─── Read-Only Modal Helper ─── */
function setModalReadOnly(isReadOnly) {
    const fieldsToDisable = [
        "eventTitle", "eventDate",
        "startHour", "startMinute", "startAmPm",
        "eventDuration", "eventNotes", "eventReminder",
        "reminderDate", "reminderHour", "reminderMinute", "reminderAmPm",
        "attendeeInput", "sendEmailToggle"
    ];
    fieldsToDisable.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isReadOnly; // safe: element may not exist if removed from HTML
    });
    // Disable category buttons
    document.querySelectorAll(".color-cat-btn").forEach(btn => {
        btn.disabled = isReadOnly;
        btn.style.pointerEvents = isReadOnly ? "none" : "";
        btn.style.opacity = isReadOnly ? "0.6" : "";
    });
    // Disable attendee remove buttons & meeting link buttons
    document.querySelectorAll(".tag-remove").forEach(btn => {
        btn.style.pointerEvents = isReadOnly ? "none" : "";
        btn.style.opacity = isReadOnly ? "0.4" : "";
    });
    const genBtn = document.getElementById("generateLinkBtn");
    const copyBtn = document.getElementById("copyLinkBtn");
    if (genBtn) { genBtn.disabled = isReadOnly; genBtn.style.display = isReadOnly ? "none" : ""; }
    if (copyBtn) { copyBtn.disabled = isReadOnly; }
    // Show/hide Send & Delete buttons
    document.getElementById("saveEventBtn").style.display = isReadOnly ? "none" : "";
    document.getElementById("deleteEventBtn").style.display = isReadOnly ? "none" : "inline-block";
    // Hide send invite box in read-only
    const sendBox = document.querySelector(".send-invite-box");
    if (sendBox) sendBox.style.display = isReadOnly ? "none" : "";
    // Show/hide View-Only badge
    let badge = document.getElementById("readOnlyBadge");
    if (!badge) {
        badge = document.createElement("span");
        badge.id = "readOnlyBadge";
        badge.className = "badge bg-secondary ms-2";
        badge.innerHTML = '<i class="bi bi-eye me-1"></i>View Only';
        document.getElementById("modalHeading").appendChild(badge);
    }
    badge.style.display = isReadOnly ? "inline-flex" : "none";
}

/* ─── Open Modal ─── */
function openModal(dateKey, index) {
    document.getElementById("selectedDate").value = dateKey;
    document.getElementById("editIndex").value = index !== null ? index : "";
    const heading = document.getElementById("modalHeading");

    // Determine read-only: whole day is past, OR specific event on today has its time elapsed
    let ev = (index !== null && events[dateKey]) ? events[dateKey][index] : null;
    const eventStartTime = ev ? (ev.startTime || null) : null;
    const past = isPastDate(dateKey) || isPastDateTime(dateKey, eventStartTime);

    if (index !== null && events[dateKey] && events[dateKey][index]) {
        heading.innerHTML = past
            ? '<i class="bi bi-eye me-2"></i>View Event'
            : '<i class="bi bi-pencil-square me-2"></i>Edit Event';
        ev = events[dateKey][index];
        document.getElementById("eventTitle").value = ev.title || "";
        document.getElementById("eventDate").value = ev.date || dateKey;
        setStartTimePicker(ev.startTime || '');
        document.getElementById("eventDuration").value = ev.duration || "1 hr";
        document.getElementById("eventNotes").value = ev.notes || "";
        document.getElementById("eventColor").value = ev.color || "#43a047";
        document.getElementById("eventReminder").checked = ev.reminder || false;
        document.getElementById("reminderDate").value = ev.reminderDate || "";
        setReminderTimePicker(ev.reminderTime || '');
        // Attendees & Meeting Link
        currentAttendees = ev.attendees ? [...ev.attendees] : [];
        const mlEdit = document.getElementById("meetingLink");
        if (mlEdit) mlEdit.value = ev.meetingLink || "";
        const sendToggleEdit = document.getElementById("sendEmailToggle");
        if (sendToggleEdit) sendToggleEdit.checked = false;
        setupColorButtons(ev.color || "#43a047");
    } else {
        heading.innerHTML = '<i class="bi bi-calendar-plus me-2"></i>Add Event';
        document.getElementById("eventTitle").value = "";
        document.getElementById("eventDate").value = dateKey;
        setStartTimePicker('');
        document.getElementById("eventDuration").value = "1 hr";
        document.getElementById("eventNotes").value = "";
        document.getElementById("eventColor").value = "#43a047";
        document.getElementById("eventReminder").checked = false;
        document.getElementById("reminderDate").value = "";
        setReminderTimePicker('');
        // Attendees & Meeting Link
        currentAttendees = [];
        const mlNew = document.getElementById("meetingLink");
        if (mlNew) mlNew.value = generateMeetingLink();
        const sendToggleNew = document.getElementById("sendEmailToggle");
        if (sendToggleNew) sendToggleNew.checked = true;
        setupColorButtons("#43a047");
    }

    // Render attendee tags & setup input
    renderAttendeeTags();
    setupAttendeeInput();
    const attendeeInputEl = document.getElementById("attendeeInput");
    if (attendeeInputEl) attendeeInputEl.value = "";

    // Apply read-only mode for past dates (view existing events only)
    setModalReadOnly(past);
    setupReminderToggle();
    modal.show();
}

/* ─── Save Event ─── */
document.getElementById("saveEventBtn").onclick = function () {
    const title = document.getElementById("eventTitle").value.trim();
    const dateVal = document.getElementById("eventDate").value;

    if (!title) { alert("Please enter an event title."); return; }
    if (!dateVal) { alert("Please select a date."); return; }

    // Block saving if the event date+time is more than 1 minute in the past
    const startTime24 = getStartTime24h();
    if (isPastDateTime(dateVal, startTime24)) {
        alert("\u26a0\ufe0f Cannot save an event in the past.\nPlease choose a future date and time (at least 1 minute from now).");
        return;
    }

    // Reminder fields are mandatory when the checkbox is checked
    const reminderChecked = document.getElementById("eventReminder").checked;
    if (reminderChecked) {
        const reminderDateVal = document.getElementById("reminderDate").value;
        const reminderTime24 = getReminderTime24h();
        if (!reminderDateVal) {
            alert("\u23f0 Reminder Date is required when \'Enable Reminder\' is checked.");
            document.getElementById("reminderDate").focus();
            return;
        }
        if (!reminderTime24) {
            alert("\u23f0 Reminder Time is required when \'Enable Reminder\' is checked.");
            document.getElementById("reminderHour").focus();
            return;
        }
    }

    const ev = {
        title: title,
        date: dateVal,
        startTime: getStartTime24h(),
        duration: document.getElementById("eventDuration").value,
        notes: document.getElementById("eventNotes").value,
        color: document.getElementById("eventColor").value,
        reminder: document.getElementById("eventReminder").checked,
        reminderDate: document.getElementById("reminderDate").value,
        reminderTime: getReminderTime24h(),
        attendees: [...currentAttendees],
        meetingLink: document.getElementById("meetingLink")?.value || "",
    };

    if (!events[dateVal]) events[dateVal] = [];

    const idx = document.getElementById("editIndex").value;
    if (idx === "") {
        events[dateVal].push(ev);
        // Only update currentDate for month view
        // Week view should not jump when creating events on other dates
        if (currentView === "month") {
            currentDate = new Date(dateVal + "T00:00:00");
        }
    } else {
        const oldDate = document.getElementById("selectedDate").value;
        if (oldDate !== dateVal) {
            events[oldDate].splice(parseInt(idx), 1);
            events[dateVal].push(ev);
        } else {
            events[dateVal][parseInt(idx)] = ev;
        }
    }

    saveStorage();
    if (ev.reminder && ev.reminderDate && ev.reminderTime) {
        scheduleReminder(ev.title, ev.reminderDate + "T" + ev.reminderTime);
    }

    // Send email invites if toggle is ON and there are attendees
    const sendToggle = document.getElementById("sendEmailToggle");
    const shouldSendEmail = sendToggle ? sendToggle.checked : false;
    if (shouldSendEmail && ev.attendees.length > 0) {
        sendEventEmails(ev, ev.attendees);
    }

    modal.hide();
    renderCurrentView();
};

/* ─── Delete Event ─── */
document.getElementById("deleteEventBtn").onclick = function () {
    const date = document.getElementById("selectedDate").value;
    const idx = document.getElementById("editIndex").value;
    if (idx !== "") {
        events[date].splice(parseInt(idx), 1);
        if (events[date].length === 0) delete events[date];
        saveStorage();
        renderCurrentView();
        modal.hide();
    }
};

/* ─── Remove All Past Events from Storage ─── */
function clearAllPastEventsFromStorage() {
    let removedCount = 0;
    const datesToDelete = [];

    for (const dateKey in events) {
        events[dateKey] = events[dateKey].filter(ev => {
            const isPast = isPastDate(dateKey) || isPastDateTime(dateKey, ev.startTime || null);
            if (isPast) removedCount++;
            return !isPast;
        });

        if (events[dateKey].length === 0) {
            datesToDelete.push(dateKey);
        }
    }

    datesToDelete.forEach(dateKey => delete events[dateKey]);

    if (removedCount > 0) {
        saveStorage();
        console.log(`✅ Removed ${removedCount} past event${removedCount !== 1 ? 's' : ''} from storage`);
    } else {
        console.log('ℹ️ No past events to remove');
    }

    return removedCount;
}

/* ─── Reminder Notification ─── */
function scheduleReminder(title, datetime) {
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    const delay = new Date(datetime) - new Date();
    if (delay > 0) {
        setTimeout(() => new Notification("🔔 Reminder: " + title), delay);
    }
}

/* ─── Navigation ─── */
// Note: prevBtn / nextBtn onclick is set by renderCurrentView() each time the view renders,
// so it always matches the active view (month = +1 month, week = +7 days).
document.getElementById("toggleDark").onclick = () => {
    document.body.classList.toggle("dark-mode");
    renderCurrentView();
};

/* ─── Today Button ─── */
document.getElementById("todayBtn").onclick = () => {
    currentDate = new Date();
    renderCurrentView();
};

/* ─── View Toggle ─── */
document.getElementById("monthViewBtn").onclick = () => {
    currentView = "month";
    document.getElementById("monthViewBtn").classList.add("active");
    document.getElementById("weekViewBtn").classList.remove("active");
    renderCurrentView();
};
document.getElementById("weekViewBtn").onclick = () => {
    currentView = "week";
    document.getElementById("weekViewBtn").classList.add("active");
    document.getElementById("monthViewBtn").classList.remove("active");
    // Reset to current week when switching to week view
    currentDate = new Date();
    renderCurrentView();
};

/* ─── Add Event Button (sidebar) ─── */
document.getElementById("addEventBtn").onclick = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const realToday = new Date();

    // Default to the actual current date if viewing the present month, else default to the 1st of the viewed month.
    let day = 1;
    if (year === realToday.getFullYear() && month === realToday.getMonth()) {
        day = realToday.getDate();
    }

    const targetKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    openModal(targetKey, null);
};

/* ─── Category Highlight (blink events + navigate to first match) ─── */
function highlightCategory(color) {
    // Remove any existing blink classes first
    document.querySelectorAll('.event.event-blink').forEach(el => el.classList.remove('event-blink'));
    document.querySelectorAll('.week-event-block.event-blink').forEach(el => el.classList.remove('event-blink'));
    document.querySelectorAll('.calendar-day.holiday-blink').forEach(el => el.classList.remove('holiday-blink'));

    // Select all event divs matching this category color (month + week views)
    const monthTargets = document.querySelectorAll(`.event[data-color="${color}"]`);
    const weekTargets = document.querySelectorAll(`.week-event-block[data-color="${color}"]`);
    const allTargets = [...monthTargets, ...weekTargets];

    // ── Special: Holiday category (#1a73e8) → also blink weekend day cells ──
    if (color === '#1a73e8') {
        const weekendCells = document.querySelectorAll('.calendar-day.weekend:not(.past-day)');
        weekendCells.forEach(cell => cell.classList.add('holiday-blink'));
        setTimeout(() => {
            document.querySelectorAll('.calendar-day.holiday-blink').forEach(el => el.classList.remove('holiday-blink'));
        }, 2500);
        if (allTargets.length === 0) return;
    } else {
        if (!allTargets.length) return;
    }

    allTargets.forEach(el => el.classList.add('event-blink'));

    // ── Scroll to the first matching event ──
    const firstTarget = allTargets[0];
    if (firstTarget) {
        // Give the blink animation a moment to start, then scroll into view
        setTimeout(() => {
            firstTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }, 80);

        // Wire up a one-time click on each blinking event → open its modal
        allTargets.forEach(el => {
            // Detect whether this is a month-view chip or a week-view block
            const isWeek = el.classList.contains('week-event-block');
            // Read dateKey and index from the onclick already set on the element
            // We simply defer to the existing onclick; no change needed — just ensure
            // the element has pointer-events (guaranteed via CSS .event-blink rule)
        });
    }

    // Also briefly highlight the matching calendar day cells (month view)
    monthTargets.forEach(el => {
        const cell = el.closest('.calendar-day');
        if (cell && !cell.classList.contains('holiday-blink')) {
            cell.classList.add('day-highlight');
            setTimeout(() => cell.classList.remove('day-highlight'), 2500);
        }
    });

    // Auto-remove blink after animation completes
    setTimeout(() => {
        document.querySelectorAll('.event.event-blink').forEach(el => el.classList.remove('event-blink'));
        document.querySelectorAll('.week-event-block.event-blink').forEach(el => el.classList.remove('event-blink'));
    }, 2500);
}

/* ─── Category Bar ─── */
const categoryInfo = {
    '#e53935': { label: '🚨 Emergency', color: '#e53935' },
    '#1a73e8': { label: '🌿 Holiday', color: '#1a73e8' },
    '#f9a825': { label: '🔔 Reminder', color: '#f9a825' },
    '#43a047': { label: '📅 Event', color: '#43a047' },
};

function renderCategoryBar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const counts = {};
    const groupedEvents = {};
    Object.keys(categoryInfo).forEach(c => {
        counts[c] = 0;
        groupedEvents[c] = [];
    });
    let total = 0;

    const addEventToGroups = (key) => {
        if (events[key]) {
            events[key].forEach((ev, idx) => {
                total++;
                const color = ev.color || '#43a047';
                const targetColor = counts[color] !== undefined ? color : '#43a047';
                counts[targetColor]++;
                groupedEvents[targetColor].push({ ...ev, dateKey: key, index: idx });
            });
        }
    };

    if (currentView === 'month') {
        for (let d = 1; d <= lastDay; d++) {
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            addEventToGroups(key);
        }
    } else if (currentView === 'week') {
        const weekStart = getWeekStart(currentDate);
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            addEventToGroups(key);
        }
    }

    // Unified category blocks — label + color bar in one element
    const labelsEl = document.getElementById('categoryLabels');
    labelsEl.innerHTML = '';
    // Hide the old segments container (no longer needed)
    const segmentsEl = document.getElementById('categorySegments');
    segmentsEl.innerHTML = '';
    segmentsEl.style.display = 'none';

    Object.keys(categoryInfo).forEach(c => {
        const info = categoryInfo[c];
        const count = counts[c];

        const block = document.createElement('div');
        block.className = 'cat-block cat-clickable';
        block.title = `Click to highlight ${info.label} events`;

        block.innerHTML = `
            <div class="cat-block-top">
                <span class="cat-bar-text">${info.label}</span>
                <span class="cat-bar-count">${count}</span>
            </div>
            <div class="cat-block-bar" style="background:${info.color};opacity:${count > 0 ? '1' : '0.18'}"></div>
        `;

        if (count > 0) block.onclick = () => highlightCategory(c);
        labelsEl.appendChild(block);
    });
}

/* ─── Weekly Report ─── */
const weeklyReportModal = new bootstrap.Modal(document.getElementById("weeklyReportModal"));

// Tracks which week offset (in weeks) from today is being shown in the report modal
let reportWeekOffset = 0;

function formatDisplayTime12(timeStr) {
    if (!timeStr) return '—';
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h < 12 ? 'AM' : 'PM';
    const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const categoryNameMap = {
    '#e53935': '🚨 Emergency',
    '#1a73e8': '🌿 Holiday',
    '#f9a825': '🔔 Reminder',
    '#43a047': '📅 Event',
};

function renderWeeklyReport(weekOffsetOverride) {
    // If called fresh (from the button), reset offset to 0 (current week)
    if (weekOffsetOverride === undefined) {
        reportWeekOffset = 0;
    } else {
        reportWeekOffset = weekOffsetOverride;
    }

    // Build the week starting from today's week + offset
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + reportWeekOffset * 7);
    const weekStart = getWeekStart(baseDate);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        weekDays.push(d);
    }

    const weekEnd = weekDays[6];
    const rangeStr = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    document.getElementById('weeklyReportRange').textContent = rangeStr;

    // Wire up the Prev / Next week navigation buttons inside the modal header
    const prevWeekBtn = document.getElementById('reportPrevWeekBtn');
    const nextWeekBtn = document.getElementById('reportNextWeekBtn');
    if (prevWeekBtn) {
        prevWeekBtn.onclick = () => renderWeeklyReport(reportWeekOffset - 1);
    }
    if (nextWeekBtn) {
        nextWeekBtn.onclick = () => renderWeeklyReport(reportWeekOffset + 1);
        // Disable forward navigation for future weeks beyond +4 weeks
        nextWeekBtn.disabled = reportWeekOffset >= 4;
    }
    // Show "This Week" label when on offset 0
    const thisWeekBadge = document.getElementById('reportThisWeekBadge');
    if (thisWeekBadge) {
        thisWeekBadge.style.display = reportWeekOffset === 0 ? 'inline-flex' : 'none';
    }

    let totalEvents = 0;
    const body = document.getElementById('weeklyReportBody');
    body.innerHTML = '';

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    weekDays.forEach(dayObj => {
        const dateKey = `${dayObj.getFullYear()}-${String(dayObj.getMonth() + 1).padStart(2, '0')}-${String(dayObj.getDate()).padStart(2, '0')}`;
        const dayEvents = events[dateKey] || [];
        totalEvents += dayEvents.length;

        const isToday = dayObj.getTime() === today.getTime();
        const isPast = dayObj < today;

        const section = document.createElement('div');
        section.className = 'wr-day-section' + (isToday ? ' wr-today' : '') + (isPast ? ' wr-past' : '');

        // Day header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'wr-day-header';

        const dayLabel = document.createElement('div');
        dayLabel.className = 'wr-day-label';
        dayLabel.innerHTML = `
            <span class="wr-day-name">${DAY_NAMES[dayObj.getDay()]}</span>
            <span class="wr-day-date ${isToday ? 'wr-today-badge' : ''}">${dayObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ${dayEvents.length > 0
                ? `<span class="wr-event-count">${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}</span>`
                : '<span class="wr-no-events">No events</span>'}
        `;

        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm wr-add-btn';
        addBtn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Add Event';
        addBtn.disabled = isPast;
        if (isPast) addBtn.title = 'Cannot add events to past dates';
        addBtn.onclick = () => {
            weeklyReportModal.hide();
            setTimeout(() => {
                openModal(dateKey, null);
                // Default start time to current time (snapped to 15-min)
                const now = new Date();
                setStartTimePicker(snapToSlot(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`));
            }, 300);
        };
        dayHeader.appendChild(dayLabel);
        dayHeader.appendChild(addBtn);
        section.appendChild(dayHeader);

        if (dayEvents.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wr-empty-day';
            empty.innerHTML = '<i class="bi bi-calendar-x me-2 opacity-50"></i>No events scheduled.';
            section.appendChild(empty);
        } else {
            const table = document.createElement('div');
            table.className = 'wr-table';
            table.innerHTML = `
                <div class="wr-table-header">
                    <div class="wr-col-title">Event</div>
                    <div class="wr-col-time">Start Time</div>
                    <div class="wr-col-duration">Duration</div>
                    <div class="wr-col-cat">Category</div>
                    <div class="wr-col-reminder">🔔 Reminder</div>
                </div>
            `;

            dayEvents.forEach((ev, idx) => {
                const row = document.createElement('div');
                row.className = 'wr-table-row';
                row.style.borderLeft = `4px solid ${ev.color || '#43a047'}`;
                row.title = 'Click to view event';

                const reminderInfo = (ev.reminder && ev.reminderDate)
                    ? `<span class="wr-reminder-pill">
                            <i class="bi bi-bell-fill me-1"></i>
                            ${formatDisplayDate(ev.reminderDate)}${ev.reminderTime ? ' at <strong>' + formatDisplayTime12(ev.reminderTime) + '</strong>' : ''}
                       </span>`
                    : '<span class="wr-no-reminder">—</span>';

                const catName = categoryNameMap[ev.color] || '📅 Event';

                row.innerHTML = `
                    <div class="wr-col-title">
                        <span class="wr-ev-dot" style="background:${ev.color || '#43a047'}"></span>
                        <div>
                            <div class="wr-ev-name">${ev.title}</div>
                            ${ev.notes ? `<div class="wr-ev-notes">${ev.notes}</div>` : ''}
                        </div>
                    </div>
                    <div class="wr-col-time">${formatDisplayTime12(ev.startTime)}</div>
                    <div class="wr-col-duration">${ev.duration || '—'}</div>
                    <div class="wr-col-cat">
                        <span class="wr-cat-chip" style="background:${ev.color || '#43a047'}22;color:${ev.color || '#43a047'};border:1px solid ${ev.color || '#43a047'}55">${catName}</span>
                    </div>
                    <div class="wr-col-reminder">${reminderInfo}</div>
                `;

                row.onclick = () => {
                    weeklyReportModal.hide();
                    setTimeout(() => openModal(dateKey, idx), 300);
                };
                row.style.cursor = 'pointer';
                table.appendChild(row);
            });

            section.appendChild(table);
        }

        body.appendChild(section);
    });

    document.getElementById('weeklyReportTotalBadge').textContent =
        `${totalEvents} Total Event${totalEvents !== 1 ? 's' : ''}`;

    weeklyReportModal.show();
}

document.getElementById('weeklyReportBtn').onclick = () => renderWeeklyReport();

/* ─── Init ─── */
// Load from localStorage immediately so the calendar isn't blank while Firestore connects
events = JSON.parse(localStorage.getItem('events') || '{}');
renderCurrentView();
// Then start the real-time Firestore listener (updates events & re-renders when data arrives)
startFirestoreListener();

/* ─── Mobile Sidebar Toggle ─── */
(function setupSidebarToggle() {
    const sidebar = document.getElementById('appSidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (!sidebar || !toggleBtn) return;

    // Create the backdrop overlay element
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    function isMobile() {
        return window.innerWidth <= 899;
    }

    function openSidebar() {
        sidebar.classList.remove('sidebar-collapsed');
        sidebar.classList.add('sidebar-expanded');
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden'; // prevent scroll behind drawer
    }

    function closeSidebar() {
        sidebar.classList.add('sidebar-collapsed');
        sidebar.classList.remove('sidebar-expanded');
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Set initial state: collapsed on mobile
    if (isMobile()) {
        sidebar.classList.add('sidebar-collapsed');
    }

    // Toggle on hamburger click
    toggleBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('sidebar-expanded')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    // Close when backdrop is tapped
    backdrop.addEventListener('click', closeSidebar);

    // On resize: restore desktop layout
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            sidebar.classList.remove('sidebar-collapsed', 'sidebar-expanded');
            backdrop.classList.remove('active');
            document.body.style.overflow = '';
        } else if (!sidebar.classList.contains('sidebar-expanded')) {
            sidebar.classList.add('sidebar-collapsed');
        }
    });
})();
