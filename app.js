/**
 * ValetSync | Core Application Engine
 * Architecture: ES6 Modules, JSON-Driven, Live Math Simulation
 */

// --- Global State ---
let masterEventsList = [];
let hotelData = {};
let inHouseEvents = [];
let simulationInterval;

// --- Utility Functions ---
const getTrafficTheme = (score) => {
    if (score >= 7.5) return { color: 'var(--impact-high)', bg: 'var(--impact-high-bg)' };
    if (score >= 4.0) return { color: 'var(--impact-med)', bg: 'var(--impact-med-bg)' };
    return { color: 'var(--impact-low)', bg: 'var(--impact-low-bg)' };
};

const formatTimeStr = (dateObj) => {
    return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const getLocalIsoDate = (dateObj) => {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

const updateClock = () => {
    const clockTime = document.getElementById('clock-time');
    const clockDate = document.getElementById('clock-date');
    if(clockTime && clockDate) {
        const now = new Date();
        clockTime.innerText = formatTimeStr(now);
        clockDate.innerText = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
};

// --- Data Parsing Engines ---

/**
 * PARSER 1: Web Scraped Events (VBC / Park)
 */
const parseEventData = (rawEvent) => {
    let start = null;
    let end = null;
    let maxImpact = 1; 
    let isTba = false;

    try {
        if (!rawEvent.impact_timeline || rawEvent.impact_timeline.error) {
            isTba = true;
            maxImpact = rawEvent.impact_timeline ? rawEvent.impact_timeline.static_impact : 1;
        } else {
            let dateStr = rawEvent.date;
            if (dateStr.includes('vary between')) {
                dateStr = dateStr.split('between')[1].split('-')[0].trim();
            }

            const windowStr = rawEvent.impact_timeline.during_event.window;
            const [startStr, endStr] = windowStr.split(' - ');

            start = new Date(`${dateStr} ${startStr}`);
            end = new Date(`${dateStr} ${endStr}`);

            if (end < start) { end.setDate(end.getDate() + 1); }

            const arrImpact = rawEvent.impact_timeline.arrival_rush.impact;
            const depImpact = rawEvent.impact_timeline.departure_rush.impact;
            maxImpact = Math.max(arrImpact, depImpact);
        }
    } catch(e) {
        isTba = true; 
    }

    let sortTimeFloat = 999;
    if (start) { sortTimeFloat = start.getHours() + (start.getMinutes() / 60); }

    return {
        id: Math.random().toString(36).substr(2, 9),
        title: rawEvent.title,
        venue: rawEvent.venue,
        timeDisplay: rawEvent.time,
        dateDisplay: rawEvent.date,
        startObj: start,
        endObj: end,
        maxImpact: maxImpact,
        isTba: isTba,
        sortTime: sortTimeFloat
    };
};

/**
 * PARSER 2: In-House Trilogy Events
 * Automatically calculates maxImpact (1-10) based on headcount.
 */
const parseInHouseEvent = (hEvent) => {
    const startObj = new Date(`${hEvent.date} ${hEvent.start_time}`);
    const endObj = new Date(`${hEvent.date} ${hEvent.end_time}`);
    
    // Handle overnight events
    if (endObj < startObj) {
        endObj.setDate(endObj.getDate() + 1);
    }

    // MATH: 1 Impact Point for every 25 guests. (Caps at 10)
    const guestCount = parseInt(hEvent.headcount) || 0;
    const calculatedImpact = Math.min(10, Math.max(1, Math.ceil(guestCount / 25)));

    return {
        id: 'inhouse_' + Math.random().toString(36).substr(2, 9),
        title: `${hEvent.title} (${guestCount} guests)`,
        venue: "Trilogy Hotel",
        timeDisplay: `${hEvent.start_time} - ${hEvent.end_time}`,
        dateDisplay: hEvent.date,
        startObj: startObj,
        endObj: endObj,
        maxImpact: calculatedImpact,
        isTba: false,
        sortTime: startObj.getHours() + (startObj.getMinutes() / 60)
    };
};

// --- Mathematical Traffic Simulation Core ---
const calculateLiveTraffic = (now, event) => {
    if (event.isTba || !event.startObj || !event.endObj) return 0;

    const arrivalWindowMs = 90 * 60 * 1000; // 90 mins before
    const departureWindowMs = 60 * 60 * 1000; // 60 mins after

    const timeNow = now.getTime();
    const timeStart = event.startObj.getTime();
    const timeEnd = event.endObj.getTime();

    // PHASE 1: Arrival Rush
    if (timeNow >= timeStart - arrivalWindowMs && timeNow < timeStart) {
        const x = (timeNow - (timeStart - arrivalWindowMs)) / arrivalWindowMs;
        const score = event.maxImpact * Math.pow(x, 3);
        return Math.max(0.5, score);
    }
    
    // PHASE 2: During Event
    if (timeNow >= timeStart && timeNow <= timeEnd) {
        return 0.0;
    }
    
    // PHASE 3: Departure Exodus
    if (timeNow > timeEnd && timeNow <= timeEnd + departureWindowMs) {
        const y = (timeNow - timeEnd) / departureWindowMs;
        const score = event.maxImpact * Math.pow(1 - y, 4);
        return Math.max(0, score);
    }

    return 0; 
};

// --- UI Rendering ---
const createEventCardHTML = (event, trafficScore, now) => {
    const theme = getTrafficTheme(trafficScore);
    const peakTheme = getTrafficTheme(event.maxImpact); 
    const isLiveWindow = trafficScore > 0 || (event.startObj && now >= event.startObj && now <= event.endObj);
    
    let statusHTML = '';
    if (event.isTba) {
        statusHTML = `<div class="countdown">Time Pending</div>`;
    } else if (now < event.startObj && trafficScore === 0) {
        const diffHrs = Math.floor((event.startObj - now) / (1000 * 60 * 60));
        statusHTML = `<div class="countdown">⏳ Starts in ${diffHrs}h</div>`;
    } else if (now >= event.startObj && now <= event.endObj) {
        statusHTML = `<div class="countdown" style="color:var(--impact-low)">▶ Event in Progress</div>`;
    }

    const trafficHTML = event.isTba ? '' : `
        <div class="traffic-module">
            <div class="traffic-header">
                <span>Traffic Impact</span>
                <span class="traffic-score" id="score-${event.id}" style="color: ${theme.color}">${trafficScore.toFixed(1)} / 10</span>
            </div>
            <div class="progress-bar-bg" style="margin-bottom: 12px;">
                <div class="progress-bar-fill" id="bar-${event.id}" style="width: ${Math.min(100, (trafficScore / 10) * 100)}%; background-color: ${theme.color}"></div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Peak Impact</span>
                <span class="calendar-impact-pill" style="margin-top: 0; background: ${peakTheme.bg}; color: ${peakTheme.color}">${event.maxImpact} / 10</span>
            </div>
        </div>
    `;

    // Highlight Trilogy Events Visually
    const isTrilogy = event.venue === "Trilogy Hotel" ? "border-color: var(--impact-med); box-shadow: 0 0 10px rgba(245, 158, 11, 0.1);" : "";

    return `
        <div class="event-card fade-in" id="card-${event.id}" style="${isTrilogy}">
            ${isLiveWindow && !event.isTba ? `<span class="badge-live">ACTIVE</span>` : ''}
            <div class="event-header">
                <div>
                    <h3 class="event-title">${event.title}</h3>
                    <p class="event-venue">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${event.venue}
                    </p>
                </div>
                <div class="event-time-main">${event.timeDisplay}</div>
            </div>
            ${statusHTML}
            ${trafficHTML}
        </div>
    `;
};

const tickSimulation = (containerId, eventsList) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const now = new Date();
    let maxGlobalImpactThisTick = 1;

    eventsList.forEach(event => {
        const score = calculateLiveTraffic(now, event);
        maxGlobalImpactThisTick = Math.max(maxGlobalImpactThisTick, score);

        const card = document.getElementById(`card-${event.id}`);
        if (card) {
            const scoreEl = document.getElementById(`score-${event.id}`);
            const barEl = document.getElementById(`bar-${event.id}`);
            if (scoreEl && barEl) {
                const theme = getTrafficTheme(score);
                scoreEl.innerText = `${score.toFixed(1)} / 10`;
                scoreEl.style.color = theme.color;
                barEl.style.width = `${Math.min(100, (score / 10) * 100)}%`;
                barEl.style.backgroundColor = theme.color;
            }
        }
    });

    const globalBadge = document.getElementById('global-impact-badge');
    if (globalBadge) {
        const globalTheme = getTrafficTheme(maxGlobalImpactThisTick);
        globalBadge.innerText = `${maxGlobalImpactThisTick.toFixed(1)} / 10`;
        globalBadge.style.background = globalTheme.color;
        globalBadge.style.boxShadow = maxGlobalImpactThisTick >= 7.5 ? `0 0 20px ${globalTheme.color}` : '0 4px 12px rgba(0,0,0,0.5)';
    }
};

// --- Initialization & Bootstrapping ---
const initDashboard = (eventsToday) => {
    const timeline = document.getElementById('timeline');
    const emptyState = document.getElementById('empty-state');
    const now = new Date();

    if (eventsToday.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    let htmlBuffer = '';
    eventsToday.forEach(e => {
        const initialScore = calculateLiveTraffic(now, e);
        htmlBuffer += createEventCardHTML(e, initialScore, now);
    });
    timeline.innerHTML = htmlBuffer;

    simulationInterval = setInterval(() => { tickSimulation('timeline', eventsToday); }, 3000);
};

const initCalendar = (eventsFuture) => {
    const cal = document.getElementById('full-calendar');
    const searchInput = document.getElementById('search-input');
    const locFilter = document.getElementById('location-filter');
    const btnGrid = document.getElementById('btn-grid');
    const btnList = document.getElementById('btn-list');

    const renderCalendar = (filteredEvents) => {
        cal.innerHTML = '';
        if(filteredEvents.length === 0) {
            cal.innerHTML = '<p style="text-align:center; color:var(--text-secondary)">No events match filters.</p>';
            return;
        }

        let lastDate = '';
        filteredEvents.forEach(e => {
            if(!e.startObj) return;
            const dateStr = e.startObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            
            if (dateStr !== lastDate) {
                const iso = getLocalIsoDate(e.startObj);
                const hTag = hotelData[iso] ? `<span class="header-hotel-stats">Arr: ${hotelData[iso].arrivals} | Dep: ${hotelData[iso].departures}</span>` : '';
                cal.innerHTML += `<div class="calendar-date-header"><span>${dateStr}</span> ${hTag}</div>`;
                lastDate = dateStr;
            }
            
            const theme = getTrafficTheme(e.maxImpact);
            const isTrilogy = e.venue === "Trilogy Hotel" ? "border-color: var(--impact-med);" : "";

            cal.innerHTML += `
                <div class="event-card fade-in" style="${isTrilogy}">
                    <div class="event-header" style="margin-bottom:0;">
                        <div>
                            <h3 class="event-title">${e.title}</h3>
                            <p class="event-venue">${e.venue}</p>
                            <div class="calendar-impact-pill" style="background: ${theme.bg}; color: ${theme.color};">Est. Impact: ${e.maxImpact}/10</div>
                        </div>
                        <div class="event-time-main">${e.timeDisplay}</div>
                    </div>
                </div>`;
        });
    };

    const applyFilters = () => {
        const query = searchInput.value.toLowerCase();
        const loc = locFilter.value;
        const filtered = eventsFuture.filter(e => {
            const matchesQuery = e.title.toLowerCase().includes(query) || e.venue.toLowerCase().includes(query);
            const matchesLoc = loc === 'all' || e.venue.includes(loc);
            return matchesQuery && matchesLoc;
        });
        renderCalendar(filtered);
    };

    searchInput.addEventListener('input', applyFilters);
    locFilter.addEventListener('change', applyFilters);

    btnGrid.addEventListener('click', () => {
        cal.classList.remove('list-view');
        btnGrid.classList.add('active'); btnList.classList.remove('active');
    });
    btnList.addEventListener('click', () => {
        cal.classList.add('list-view');
        btnList.classList.add('active'); btnGrid.classList.remove('active');
    });

    renderCalendar(eventsFuture);
};

const bootApp = async () => {
    setInterval(updateClock, 1000); updateClock();

    try {
        const timestamp = new Date().getTime();
        
        // Fetch all 3 files in parallel
        const [eventsRes, hotelRes, inHouseRes] = await Promise.all([
            fetch(`./events.json?t=${timestamp}`),
            fetch(`./hotel_traffic.json?t=${timestamp}`),
            fetch(`./hotel_events.json?t=${timestamp}`).catch(() => ({ ok: false })) 
        ]);

        const rawEvents = await eventsRes.json();
        if (hotelRes.ok) { try { hotelData = await hotelRes.json(); } catch(e){} }
        
        let rawInHouseEvents = [];
        if (inHouseRes.ok) { try { rawInHouseEvents = await inHouseRes.json(); } catch(e){} }

        const documentLoading = document.getElementById('loading');
        if (documentLoading) documentLoading.classList.add('hidden');

        const now = new Date();
        const todayMidnight = new Date(now);
        todayMidnight.setHours(0,0,0,0);
        const todayString = now.toDateString();

        let eventsToday = [];
        let eventsFuture = [];

        // 1. Process Web Scraped Events
        rawEvents.forEach(rawEvent => {
            const parsedEvent = parseEventData(rawEvent);
            if (parsedEvent.startObj && parsedEvent.startObj.toDateString() === todayString) {
                eventsToday.push(parsedEvent);
            } else if (parsedEvent.startObj && parsedEvent.startObj > todayMidnight) {
                eventsFuture.push(parsedEvent);
            } else if (parsedEvent.isTba) {
                if(rawEvent.date.includes(todayMidnight.getFullYear().toString())) { eventsFuture.push(parsedEvent); }
            }
        });

        // 2. Process Internal Hotel Events (hotel_events.json)
        rawInHouseEvents.forEach(hEvent => {
            const parsedEvent = parseInHouseEvent(hEvent);
            if (parsedEvent.startObj && parsedEvent.startObj.toDateString() === todayString) {
                eventsToday.push(parsedEvent);
            } else if (parsedEvent.startObj && parsedEvent.startObj > todayMidnight) {
                eventsFuture.push(parsedEvent);
            }
        });

        // 3. Synthesize Hotel Guest Traffic (Check-ins/Check-outs)
        const todayIsoStr = getLocalIsoDate(now);
        if (hotelData[todayIsoStr]) {
            const dep = parseInt(hotelData[todayIsoStr].departures) || 0;
            const arr = parseInt(hotelData[todayIsoStr].arrivals) || 0;

            const arrStat = document.getElementById('today-arrivals');
            if(arrStat) { 
                arrStat.innerText = arr; 
                document.getElementById('today-departures').innerText = dep; 
                document.getElementById('hotel-stats-today').classList.remove('hidden'); 
            }

            if (dep > 0) {
                const maxI = Math.min(10, Math.ceil(dep / 10));
                const sObj = new Date(`${todayString} 06:00 AM`);
                const eObj = new Date(`${todayString} 01:00 PM`);
                eventsToday.push({
                    id: 'checkout', title: `Hotel Check-outs (${dep} cars)`, venue: "Trilogy Hotel",
                    timeDisplay: "06:00 AM - 01:00 PM", startObj: sObj, endObj: eObj, maxImpact: maxI, isTba: false, sortTime: 6.0
                });
            }
            if (arr > 0) {
                const maxI = Math.min(10, Math.ceil(arr / 10));
                const sObj = new Date(`${todayString} 03:00 PM`);
                const eObj = new Date(`${todayString} 08:30 PM`);
                eventsToday.push({
                    id: 'checkin', title: `Hotel Check-ins (${arr} cars)`, venue: "Trilogy Hotel",
                    timeDisplay: "03:00 PM - 08:30 PM", startObj: sObj, endObj: eObj, maxImpact: maxI, isTba: false, sortTime: 15.0
                });
            }
        }

        // Apply Primary Sorting Rule (Severity -> Time)
        eventsToday.sort((a, b) => b.maxImpact - a.maxImpact || a.sortTime - b.sortTime);
        eventsFuture.sort((a, b) => a.startObj - b.startObj);

        // Route to appropriate page controller
        if (document.getElementById('page-home')) {
            initDashboard(eventsToday);
        } else if (document.getElementById('page-calendar')) {
            initCalendar(eventsFuture);
        }

    } catch (error) {
        console.error("Boot Failed:", error);
        const ld = document.getElementById('loading');
        if(ld) ld.innerHTML = `<span style="color:var(--impact-high)">Network offline. Check data feeds.</span>`;
    }
};

document.addEventListener('DOMContentLoaded', bootApp);
