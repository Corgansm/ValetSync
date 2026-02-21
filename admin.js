document.addEventListener('DOMContentLoaded', () => {
    
    // --- FORM 1: EVENTS ---
    const form = document.getElementById('admin-form');
    const statusDiv = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');

    const formatTime12h = (time24) => {
        let [hours, minutes] = time24.split(':');
        hours = parseInt(hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        const hoursStr = hours < 10 ? '0' + hours : hours;
        return `${hoursStr}:${minutes} ${ampm}`;
    };

    const formatLongDate = (dateIso) => {
        const d = new Date(dateIso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            pin: document.getElementById('admin-pin').value,
            event: {
                title: document.getElementById('event-title').value,
                date: formatLongDate(document.getElementById('event-date').value),
                start_time: formatTime12h(document.getElementById('start-time').value),
                end_time: formatTime12h(document.getElementById('end-time').value),
                headcount: parseInt(document.getElementById('event-headcount').value)
            }
        };

        submitBtn.disabled = true;
        submitBtn.innerText = "Processing...";
        statusDiv.className = "status-message hidden";

        try {
            const response = await fetch('/api/addEvent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                statusDiv.innerText = "✅ Event Successfully Added!";
                statusDiv.className = "status-message status-success fade-in";
                form.reset();
            } else {
                throw new Error(result.error || "Submission failed");
            }
        } catch (error) {
            statusDiv.innerText = `❌ Error: ${error.message}`;
            statusDiv.className = "status-message status-error fade-in";
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Push to Schedule";
        }
    });

    // --- FORM 2: HOTEL TRAFFIC ---
    const trafficForm = document.getElementById('traffic-form');
    const trafficStatusDiv = document.getElementById('traffic-form-status');
    const trafficSubmitBtn = document.getElementById('traffic-submit-btn');

    trafficForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            pin: document.getElementById('traffic-pin').value,
            date: document.getElementById('traffic-date').value, // Leaves it as YYYY-MM-DD
            arrivals: parseInt(document.getElementById('traffic-arrivals').value),
            departures: parseInt(document.getElementById('traffic-departures').value)
        };

        trafficSubmitBtn.disabled = true;
        trafficSubmitBtn.innerText = "Updating...";
        trafficStatusDiv.className = "status-message hidden";

        try {
            const response = await fetch('/api/updateTraffic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                trafficStatusDiv.innerText = "✅ Traffic Successfully Updated!";
                trafficStatusDiv.className = "status-message status-success fade-in";
                trafficForm.reset();
            } else {
                throw new Error(result.error || "Submission failed");
            }
        } catch (error) {
            trafficStatusDiv.innerText = `❌ Error: ${error.message}`;
            trafficStatusDiv.className = "status-message status-error fade-in";
        } finally {
            trafficSubmitBtn.disabled = false;
            trafficSubmitBtn.innerText = "Update Traffic Data";
        }
    });
});

// --- FORM 3: SHIFT NOTES ---
    const noteForm = document.getElementById('note-form');
    const noteStatusDiv = document.getElementById('note-form-status');
    const noteSubmitBtn = document.getElementById('note-submit-btn');

    // Fetch current note to pre-fill the text area (fails silently if file doesn't exist yet)
    fetch('./shift_note.json?t=' + new Date().getTime())
        .then(res => res.json())
        .then(data => {
            if (data && data.note) {
                document.getElementById('shift-note-text').value = data.note;
            }
        }).catch(e => {});

    noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            pin: document.getElementById('note-pin').value,
            note: document.getElementById('shift-note-text').value
        };

        noteSubmitBtn.disabled = true;
        noteSubmitBtn.innerText = "Posting...";
        noteStatusDiv.className = "status-message hidden";

        try {
            const response = await fetch('/api/updateNote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                noteStatusDiv.innerText = "✅ Note Successfully Posted!";
                noteStatusDiv.className = "status-message status-success fade-in";
                // Only clear the PIN so they can still see what they typed
                document.getElementById('note-pin').value = ''; 
            } else {
                throw new Error(result.error || "Submission failed");
            }
        } catch (error) {
            noteStatusDiv.innerText = `❌ Error: ${error.message}`;
            noteStatusDiv.className = "status-message status-error fade-in";
        } finally {
            noteSubmitBtn.disabled = false;
            noteSubmitBtn.innerText = "Post Note to Dashboard";
        }
    });
