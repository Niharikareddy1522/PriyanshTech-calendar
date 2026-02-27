let currentDate = new Date();
let events = JSON.parse(localStorage.getItem("events")) || {};
let dragged = null;
let currentView = "month"; // "month" or "week"

const modal = new bootstrap.Modal(document.getElementById("eventModal"));

/* ─── Storage ─── */
function saveStorage() {
    localStorage.setItem("events", JSON.stringify(events));
}

/* ─── Live Clock ─── */
function updateClock() {
    const now = new Date();
    document.getElementById("liveClock").innerHTML =
        now.toDateString() + "<br>" + now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

/* ─── Duration Helper ─── */
function getDurationMins(duration) {
    const map = { "15 min": 15, "30 min": 30, "45 min": 45, "1 hr": 60, "1.5 hr": 90, "2 hr": 120, "3 hr": 180, "All day": 1440 };
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

/* ─── Render Current View ─── */
function renderCurrentView() {
    const calendar = document.getElementById("calendar");
    calendar.style.display = "";
    if (currentView === "week") {
        calendar.className = "";
        renderWeekView();
    } else {
        calendar.className = "calendar-grid";
        renderCalendar();
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
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d => {
        let h = document.createElement("div");
        h.className = "calendar-weekday";
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

        let div = document.createElement("div");
        div.className = "calendar-day";
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
                let eDiv = document.createElement("div");
                eDiv.className = "event";
                eDiv.style.background = ev.color;
                eDiv.draggable = true;
                const timePrefix = ev.startTime ? formatShortTime(ev.startTime) + ' ' : '';
                eDiv.innerHTML = `
                    <span><strong class="ev-time">${timePrefix}</strong>${ev.title}</span>
                    ${ev.reminder ? '<i class="bi bi-bell-fill"></i>' : ''}
                `;
                eDiv.onclick = (e) => { e.stopPropagation(); openModal(dateKey, index); };
                eDiv.ondragstart = () => dragged = { from: dateKey, index };
                div.appendChild(eDiv);
            });
        }

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

        calendar.appendChild(div);
    }

    renderMiniCalendar();
    setupMonthNavigation();
}

/* ─── Setup Month Navigation ─── */
function setupMonthNavigation() {
    document.getElementById("prevBtn").onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCurrentView(); };
    document.getElementById("nextBtn").onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCurrentView(); };
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
                ${days.map(d => `<div class="mini-day-name">${d}</div>`).join("")}
    `;

    for (let i = 0; i < firstDay; i++)
        html += `<div class="mini-day other-month">${prevLastDate - firstDay + 1 + i}</div>`;

    for (let day = 1; day <= lastDate; day++) {
        const isToday = day === today.getDate() && m === today.getMonth() && y === today.getFullYear();
        html += `<div class="mini-day${isToday ? " mini-today" : ""}">${day}</div>`;
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
    tzLabel.innerText = "GMT+05:30";

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
            document.getElementById("eventStartTime").value = `${String(i - 1).padStart(2, '0')}:00`;
            openModal(dateKey, null);
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
    tzCorner.textContent = "GMT+05:30";
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
                if (ev.duration === "All day") {
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
    for (let i = 0; i < 7; i++) {
        const d = weekDays[i];
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const isToday = d.getTime() === today.getTime();

        const col = document.createElement("div");
        col.className = `week-day-col ${isToday ? 'wk-today-col' : ''}`;

        // Background hour slots (for click targets + grid lines)
        for (let h = 0; h < 24; h++) {
            const hourCell = document.createElement("div");
            hourCell.className = "week-hour-cell";
            hourCell.dataset.hour = h;
            hourCell.onclick = () => {
                document.getElementById("eventStartTime").value = `${String(h).padStart(2, '0')}:00`;
                openModal(dateKey, null);
            };
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
                const topPx = (hours * 60) + minutes;

                const eDiv = document.createElement("div");
                eDiv.className = "week-event-block";
                eDiv.style.background = ev.color || "#43a047";
                eDiv.style.top = `${topPx}px`;
                eDiv.style.height = `${Math.max(durationMins, 18)}px`;

                const timeStr = ev.startTime;
                eDiv.innerHTML = `<span class="week-ev-title">${ev.title}</span><span class="week-ev-time">${timeStr}</span>`;
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

    // Navigation: prev/next week
    document.getElementById("prevBtn").onclick = () => {
        currentDate.setDate(currentDate.getDate() - 7);
        renderCurrentView();
    };
    document.getElementById("nextBtn").onclick = () => {
        currentDate.setDate(currentDate.getDate() + 7);
        renderCurrentView();
    };

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

    fields.style.cssText = chk.checked ? "display:flex!important;" : "display:none!important;";
    chk.onchange = () => {
        fields.style.cssText = chk.checked ? "display:flex!important;" : "display:none!important;";
    };
}

/* ─── Open Modal ─── */
function openModal(dateKey, index) {
    document.getElementById("selectedDate").value = dateKey;
    document.getElementById("editIndex").value = index !== null ? index : "";
    const heading = document.getElementById("modalHeading");

    if (index !== null && events[dateKey] && events[dateKey][index]) {
        heading.innerHTML = '<i class="bi bi-pencil-square me-2"></i>Edit Event';
        document.getElementById("deleteEventBtn").style.display = "inline-block";
        let ev = events[dateKey][index];
        document.getElementById("eventTitle").value = ev.title || "";
        document.getElementById("eventDate").value = ev.date || dateKey;
        document.getElementById("eventStartTime").value = ev.startTime || "";
        document.getElementById("eventDuration").value = ev.duration || "1 hr";
        document.getElementById("eventNotes").value = ev.notes || "";
        document.getElementById("eventColor").value = ev.color || "#43a047";
        document.getElementById("eventReminder").checked = ev.reminder || false;
        document.getElementById("reminderDate").value = ev.reminderDate || "";
        document.getElementById("reminderTime").value = ev.reminderTime || "";
        setupColorButtons(ev.color || "#43a047");
    } else {
        heading.innerHTML = '<i class="bi bi-calendar-plus me-2"></i>Add Event';
        document.getElementById("deleteEventBtn").style.display = "none";
        document.getElementById("eventTitle").value = "";
        document.getElementById("eventDate").value = dateKey;
        document.getElementById("eventStartTime").value = "";
        document.getElementById("eventDuration").value = "1 hr";
        document.getElementById("eventNotes").value = "";
        document.getElementById("eventColor").value = "#43a047";
        document.getElementById("eventReminder").checked = false;
        document.getElementById("reminderDate").value = "";
        document.getElementById("reminderTime").value = "";
        setupColorButtons("#43a047");
    }

    setupReminderToggle();
    modal.show();
}

/* ─── Save Event ─── */
document.getElementById("saveEventBtn").onclick = function () {
    const title = document.getElementById("eventTitle").value.trim();
    const dateVal = document.getElementById("eventDate").value;

    if (!title) { alert("Please enter an event title."); return; }
    if (!dateVal) { alert("Please select a date."); return; }

    const ev = {
        title: title,
        date: dateVal,
        startTime: document.getElementById("eventStartTime").value,
        duration: document.getElementById("eventDuration").value,
        notes: document.getElementById("eventNotes").value,
        color: document.getElementById("eventColor").value,
        reminder: document.getElementById("eventReminder").checked,
        reminderDate: document.getElementById("reminderDate").value,
        reminderTime: document.getElementById("reminderTime").value,
    };

    if (!events[dateVal]) events[dateVal] = [];

    const idx = document.getElementById("editIndex").value;
    if (idx === "") {
        events[dateVal].push(ev);
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
document.getElementById("prevBtn").onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCurrentView(); };
document.getElementById("nextBtn").onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCurrentView(); };
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

    // Labels
    const labelsEl = document.getElementById('categoryLabels');
    labelsEl.innerHTML = '';
    Object.keys(categoryInfo).forEach(c => {
        const info = categoryInfo[c];
        const count = counts[c];
        const label = document.createElement('div');
        label.className = 'cat-bar-label';
        label.innerHTML = `<span class="cat-bar-dot" style="background:${info.color}"></span><span class="cat-bar-text">${info.label}</span><span class="cat-bar-count">${count}</span>`;
        labelsEl.appendChild(label);
    });

    const segmentsEl = document.getElementById('categorySegments');
    segmentsEl.innerHTML = '';

    // Create 4 equal segments. If a category has events, show its color brightly.
    // If empty, show it faintly so the labels always align with their respective blocks.
    Object.keys(categoryInfo).forEach(c => {
        const seg = document.createElement('div');
        seg.className = 'cat-bar-segment';
        seg.style.flex = '1';

        if (counts[c] > 0) {
            seg.style.background = categoryInfo[c].color;
            seg.style.opacity = '1';
        } else {
            seg.style.background = categoryInfo[c].color;
            seg.style.opacity = '0.08'; // Faint placeholder instead of spreading other colors
        }
        segmentsEl.appendChild(seg);
    });
}

/* ─── Init ─── */
renderCurrentView();