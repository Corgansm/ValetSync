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
