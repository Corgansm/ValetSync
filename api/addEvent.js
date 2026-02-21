export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { pin, event } = req.body;

    // 1. Validate PIN
    if (pin !== process.env.ADMIN_PIN) {
        return res.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_PAT;
    const REPO_OWNER = process.env.REPO_OWNER;
    const REPO_NAME = process.env.REPO_NAME;
    const FILE_PATH = 'hotel_events.json';

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

    try {
        // 2. Fetch current file
        const getRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });

        let currentEvents = [];
        let sha = null;

        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            
            // --- THE SAFETY NET FIX ---
            try {
                // Check if the file has text. If yes, parse it. If no, start an empty array.
                currentEvents = content.trim() ? JSON.parse(content) : [];
            } catch (parseError) {
                console.warn("Existing JSON was empty or malformed. Starting fresh array.");
                currentEvents = []; // Fallback so it doesn't crash
            }
        }

        // 3. Append the new event
        currentEvents.push(event);

        // 4. Encode back to base64
        const newContentBase64 = Buffer.from(JSON.stringify(currentEvents, null, 4)).toString('base64');

        // 5. Commit back to GitHub
        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Add in-house event: ${event.title}`,
                content: newContentBase64,
                sha: sha 
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(err.message);
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("GitHub API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error while updating GitHub' });
    }
}
