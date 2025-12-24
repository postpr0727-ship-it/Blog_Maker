
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing' });
    }

    const { prompt, model } = req.body;
    let targetModel = model || 'gemini-1.5-flash';

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

    async function getAvailableModel() {
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const resp = await fetch(listUrl);
            const data = await resp.json();
            if (data.models) {
                // Prioritize flash models, then pro, then any gemini model
                const preferred = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];
                const available = data.models
                    .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''));

                console.log('Available models for this key:', available);

                for (const p of preferred) {
                    if (available.includes(p)) return p;
                }
                return available.find(m => m.includes('gemini')) || available[0];
            }
        } catch (e) {
            console.error('Failed to list models:', e);
        }
        return null;
    }

    try {
        let result = await attemptGenerate(targetModel);

        // Fallback logic: if target model is not found, try to list and find a working one
        if (!result.ok && (result.status === 404 || result.status === 400)) {
            console.warn(`Initial model ${targetModel} failed. Fetching available models...`);
            const discoveredModel = await getAvailableModel();

            if (discoveredModel && discoveredModel !== targetModel) {
                console.log(`Retrying with discovered model: ${discoveredModel}`);
                result = await attemptGenerate(discoveredModel);
            } else if (targetModel !== 'gemini-pro') {
                // Secondary fallback if listing fails but we haven't tried gemini-pro yet
                console.log(`Falling back to gemini-pro as a last resort.`);
                result = await attemptGenerate('gemini-pro');
            }
        }

        if (!result.ok) {
            // If still failed, return the original error data
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
