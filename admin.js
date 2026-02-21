document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('admin-form');
    const statusDiv = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');

    // Helper: Convert 24h "14:30" to 12h "02:30 PM"
    const formatTime12h = (time24) => {
        let [hours, minutes] = time24.split(':');
        hours = parseInt(hours);
        const ampm = hours >= 12 ? 'PM' : 'AM'; 
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const hoursStr = hours < 10 ? '0' + hours : hours;
        return `${hoursStr}:${minutes} ${ampm}`;
    };

    // Helper: Convert "2026-02-21" to "February 21, 2026"
    const formatLongDate = (dateIso) => {
        // Appending T00:00:00 prevents timezone shifting bugs
        const d = new Date(dateIso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 1. Gather & Format Data
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

        // 2. Loading State
        submitBtn.disabled = true;
        submitBtn.innerText = "Processing...";
        statusDiv.className = "status-message hidden";

        // 3. Send to Vercel Serverless Function
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

});
