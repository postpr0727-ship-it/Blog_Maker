
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing' });
    }

    const { prompt, model } = req.body;
    const primaryModel = model || 'gemini-1.5-flash';
    const fallbackModel = 'gemini-pro';

    async function attemptGenerate(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
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
        return { ok: response.ok, status: response.status, data, modelUsed: modelName };
    }

    try {
        let result = await attemptGenerate(primaryModel);

        // Fallback logic if the primary model is not found or supported
        if (!result.ok && (result.status === 404 || result.status === 400)) {
            console.warn(`Primary model ${primaryModel} failed. Attempting fallback with ${fallbackModel}.`);
            result = await attemptGenerate(fallbackModel);
        }

        if (!result.ok) {
            return res.status(result.status).json(result.data);
        }

        const content = result.data.candidates[0].content.parts[0].text;
        const cleanContent = content.replace(/```json\n?/, '').replace(/```$/, '').trim();
        const jsonResult = JSON.parse(cleanContent);

        res.status(200).json({ ...jsonResult, usedModel: result.modelUsed });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
