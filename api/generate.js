
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing' });
    }

    const { prompt, model } = req.body;
    const modelName = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.85,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const content = data.candidates[0].content.parts[0].text;
        // Clean up markdown if AI accidentally included it
        const cleanContent = content.replace(/```json\n?/, '').replace(/```$/, '').trim();
        const result = JSON.parse(cleanContent);

        res.status(200).json({ ...result, usedModel: modelName });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
