export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { pin, date, arrivals, departures } = req.body;

    // 1. Validate PIN
    if (pin !== process.env.ADMIN_PIN) {
        return res.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_PAT;
    const REPO_OWNER = process.env.REPO_OWNER;
    const REPO_NAME = process.env.REPO_NAME;
    const FILE_PATH = 'hotel_traffic.json';

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

    try {
        // 2. Fetch current file
        const getRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });

        let currentTraffic = {};
        let sha = null;

        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            currentTraffic = JSON.parse(content);
        }

        // 3. Update or create the entry for the specified date
        currentTraffic[date] = {
            arrivals: arrivals,
            departures: departures
        };

        const newContentBase64 = Buffer.from(JSON.stringify(currentTraffic, null, 4)).toString('base64');

        // 4. Commit back to GitHub
        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Update traffic data for ${date}`,
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
