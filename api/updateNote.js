export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { pin, note } = req.body;

    // 1. Validate PIN
    if (pin !== process.env.ADMIN_PIN) {
        return res.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_PAT;
    const REPO_OWNER = process.env.REPO_OWNER;
    const REPO_NAME = process.env.REPO_NAME;
    const FILE_PATH = 'shift_note.json';

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

    try {
        const getRes = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        let sha = null;
        
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
        }

        const newContent = {
            note: note,
            updated_at: new Date().toISOString()
        };

        const newContentBase64 = Buffer.from(JSON.stringify(newContent, null, 4)).toString('base64');

        const bodyObj = {
            message: `Update shift handoff note`,
            content: newContentBase64
        };
        
        // Only attach the SHA if the file already exists in GitHub
        if (sha) {
            bodyObj.sha = sha;
        }

        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyObj)
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
