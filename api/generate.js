import * as cheerio from 'cheerio';

// Constants
const MAX_CONTENT_PER_LINK = 3000;
const FETCH_TIMEOUT = 5000;
const MAX_HTML_SIZE = 1024 * 1024; // 1MB

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing' });
    }

    const { prompt, model, links } = req.body;
    let targetModel = model || 'gemini-1.5-flash';

    // --- 1. Fetch Link Content (Zero-Hallucination Booster) ---
    let linkContext = "";
    if (links && Array.isArray(links) && links.length > 0) {
        console.log(`Fetching content for ${links.length} links...`);
        const fetchPromises = links.map(async (url, index) => {
            try {
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(FETCH_TIMEOUT)
                });

                if (!response.ok) {
                    return `[링크 ${index + 1} (${url})]: 정보를 불러올 수 없음 (HTTP ${response.status})`;
                }

                // Check content size
                const contentLength = response.headers.get('content-length');
                if (contentLength && parseInt(contentLength) > MAX_HTML_SIZE) {
                    return `[링크 ${index + 1} (${url})]: 파일이 너무 큼 (${Math.round(contentLength / 1024)}KB)`;
                }

                const html = await response.text();

                // Additional size check after download
                if (html.length > MAX_HTML_SIZE) {
                    return `[링크 ${index + 1} (${url})]: 콘텐츠가 너무 큼`;
                }

                const $ = cheerio.load(html);

                // Remove noise
                $('script, style, nav, footer, header, ads, iframe').remove();

                // Extract meaningful text
                const title = $('title').text().trim();
                const bodyText = $('article, main, .content, #content, .post-content, .article-body, .article_body')
                    .text() || $('body').text();

                const cleanText = bodyText
                    .replace(/\s+/g, ' ')
                    .substring(0, MAX_CONTENT_PER_LINK)
                    .trim();

                return `[참고 자료 ${index + 1} 원문]\\n출처: ${url}\\n제목: ${title}\\n내용: ${cleanText}`;
            } catch (e) {
                const errorType = e.name === 'TimeoutError' ? '타임아웃' :
                                  e.name === 'TypeError' ? '네트워크 오류' :
                                  '읽기 실패';
                console.error(`Failed to fetch ${url}:`, e.message);
                return `[참고 자료 ${index + 1} (${url})]: ${errorType} (${e.message})`;
            }
        });

        const fetchResults = await Promise.allSettled(fetchPromises);
        const fetchedTexts = fetchResults.map((result, index) =>
            result.status === 'fulfilled' ? result.value : `[참고 자료 ${index + 1}]: 처리 실패`
        );
        linkContext = "\\n\\n--- [참고 자료 원문 데이터 시작] ---\\n" + fetchedTexts.join("\\n\\n") + "\\n--- [참고 자료 원문 데이터 끝] ---\\n";
    }

    // Combine original prompt with link context
    const finalPrompt = prompt + linkContext;

    async function attemptGenerate(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    temperature: 0.4,
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
                const preferred = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];
                const available = data.models
                    .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''));

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

        if (!result.ok && (result.status === 404 || result.status === 400)) {
            const discoveredModel = await getAvailableModel();
            if (discoveredModel && discoveredModel !== targetModel) {
                result = await attemptGenerate(discoveredModel);
            } else if (targetModel !== 'gemini-pro') {
                result = await attemptGenerate('gemini-pro');
            }
        }

        if (!result.ok) {
            return res.status(result.status).json(result.data);
        }

        // Safe array access with validation
        const candidate = result.data.candidates?.[0];
        if (!candidate?.content?.parts?.[0]?.text) {
            console.error('Invalid API response structure:', JSON.stringify(result.data));
            return res.status(500).json({
                error: 'Invalid response structure from Gemini API',
                details: 'Missing candidates or content data'
            });
        }

        const content = candidate.content.parts[0].text;
        const cleanContent = content.replace(/```json\n?/, '').replace(/```$/, '').trim();

        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('JSON parsing failed:', cleanContent.substring(0, 200));
            return res.status(500).json({
                error: 'Failed to parse AI response as JSON',
                details: parseError.message
            });
        }

        res.status(200).json({ ...jsonResult, usedModel: result.modelUsed });

    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error',
            type: error.name
        });
    }
}
