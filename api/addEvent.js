export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { pin, event } = req.body;

    // 1. Validate PIN (You set this in Vercel settings)
    if (pin !== process.env.ADMIN_PIN) {
        return res.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_PAT;
    const REPO_OWNER = process.env.REPO_OWNER; // e.g., "Corgansm"
    const REPO_NAME = process.env.REPO_NAME; // e.g., "VBC-Events"
    const FILE_PATH = 'hotel_events.json';

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

    try {
        // 2. Get the current file from GitHub to get its SHA (required to update it)
        const getRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });

        let currentEvents = [];
        let sha = null;

        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            // Decode the base64 content
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            currentEvents = JSON.parse(content);
        }

        // 3. Append the new event
        currentEvents.push(event);

        // 4. Encode back to base64
        const newContentBase64 = Buffer.from(JSON.stringify(currentEvents, null, 4)).toString('base64');

        // 5. Commit the update back to GitHub
        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Add in-house event: ${event.title}`,
                content: newContentBase64,
                sha: sha // Include the sha if the file already exists
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