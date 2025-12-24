document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const form = document.getElementById('generator-form');
    const generateBtn = document.getElementById('generate-btn');
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const resultState = document.getElementById('result-state');
    const titlesContainer = document.getElementById('titles-container');
    const contentBody = document.getElementById('content-body');
    const copyBodyBtn = document.getElementById('copy-body-btn');
    const refineToggle = document.getElementById('refine-toggle');
    const refineArea = document.getElementById('refine-area');
    const toast = document.getElementById('toast');
    const refineBtn = document.getElementById('refine-btn');

    // Inputs
    const mainKeywordInput = document.getElementById('main-keyword');
    const personaNameInput = document.getElementById('persona-name');
    const personaMoodParams = document.getElementsByName('mood');
    const personaAgeInput = document.getElementById('persona-age');
    const personaJobInput = document.getElementById('persona-job');
    const personaGenderInput = document.getElementById('persona-gender');
    const topicPromptInput = document.getElementById('topic-prompt');
    const lengthParams = document.getElementsByName('length');
    const refLinks = document.querySelectorAll('.ref-link');



    // State
    let isGenerating = false;



    // --- Core Functions ---

    // 1. Generate Handler
    generateBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Validation
        if (!mainKeywordInput.value.trim()) {
            alert('핵심 키워드를 입력해주세요.');
            mainKeywordInput.focus();
            return;
        }

        // If no local key, we'll try the serverless function which may have the key preset.
        // We'll proceed and let executePrompt handle the failure if neither exists.

        // UI State Update
        setLoading(true);

        try {
            // Gatther Form Data
            const formData = getFormData();

            // Call Gemini API (Self-Healing Included)
            const data = await callGeminiAPI(formData);

            // Render Results
            renderResults(data);

            // Show Results
            setLoading(false);
            showResults();

            // Display used model
            if (data.usedModel) {
                document.getElementById('used-model-name').innerText = data.usedModel;
            }

        } catch (error) {
            console.error(error);
            setLoading(false);
            alert(`오류가 발생했습니다: ${error.message}`);
        }
    });

    // 2. Form Data Gatherer
    function getFormData() {
        return {
            keyword: mainKeywordInput.value.trim(),
            name: personaNameInput.value.trim() || '익명',
            gender: personaGenderInput.options[personaGenderInput.selectedIndex].text,
            age: personaAgeInput.options[personaAgeInput.selectedIndex].text,
            job: personaJobInput.value.trim() || '일반인',
            mood: document.querySelector('input[name="mood"]:checked').value, // happy, calm, excited, informative
            length: document.querySelector('input[name="length"]:checked').value,
            prompt: topicPromptInput.value.trim(),
            links: Array.from(refLinks).map(input => input.value.trim()).filter(url => url)
        };
    }

    // 3. Call Gemini API (Self-Healing)
    async function callGeminiAPI(formData, retryModel = null) {
        const prompt = buildPrompt(formData);
        return await executePrompt(prompt, retryModel);
    }

    // New unified prompt executor
    // Unified prompt executor via Serverless Function
    async function executePrompt(prompt, retryModel = null) {
        const modelName = retryModel || 'gemini-1.5-flash';

        try {
            const resp = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model: modelName })
            });

            let data;
            const contentType = resp.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await resp.json();
            } else {
                const text = await resp.text();
                throw new Error(`서버 응답 오류 (${resp.status}): ${text.substring(0, 100)}`);
            }

            if (!resp.ok) {
                const errorMsg = typeof data.error === 'object' ? JSON.stringify(data.error) : data.error;
                throw new Error(errorMsg || `서버 오류 (${resp.status})`);
            }

            return data;
        } catch (e) {
            console.error('API call failed:', e);
            if (e.message.includes('404')) {
                throw new Error('API 경로(/api/generate)를 찾을 수 없습니다. Vercel에 배포 중이거나 로컬에서 "vercel dev"를 사용 중인지 확인해주세요.');
            }
            throw e;
        }
    }

    // 4. Prompt Builder
    function buildPrompt(data) {
        return `
            당신은 네이버 블로그 콘텐츠 최적화 전문가입니다. 
            주어진 페르소나와 키워드를 바탕으로 블로그 포스팅을 작성하세요.
            반드시 아래 JSON 형식으로만 응답해야 합니다. 마크다운 코드블록(\`\`\`json)을 사용하지 말고 순수 JSON만 반환하세요.

            [페르소나 설정]
            - 이름: ${data.name}
            - 성별/나이: ${data.gender}, ${data.age}
            - 직업: ${data.job}
            - 기분/톤: ${data.mood} (happy: 밝고 명랑한, calm: 차분하고 감성적인, excited: 열정적이고 흥분된, informative: 전문적이고 객관적인)

            [콘텐츠 설정]
            - 핵심 키워드: ${data.keyword}
            - 추가 요청사항: ${data.prompt}
            - 길이: ${data.length} (short: 공백제외 1000자 내외, medium: 2000자 내외, long: 3000자 이상)
            - 참고 링크: ${data.links.join(', ')}

            [작성 지침]
            1. 제목: 네이버 검색(SEO)에 유리하고 클릭을 유도하는 제목 3개를 제안하세요. 제목에 핵심 키워드가 반드시 포함되어야 합니다. 단, 페르소나의 이름은 제목에 절대 포함하지 마세요.
            2. 본문:
               - 서론-본론-결론 구조를 갖추세요.
               - 페르소나의 말투(구어체, 이모지 사용 등)를 완벽하게 반영하세요. ${data.mood === 'happy' ? '이모지를 적극 사용하여 친근하게.' : ''}
               - AI가 작성한 티가 나지 않도록 마크다운 기호(##, **)를 절대 사용하지 마세요. 소제목이나 강조가 필요한 부분은 줄바꿈으로 표현하세요.
               - 핵심 키워드는 제목에만 필수적으로 포함시키고, 본문에서는 강제로 반복하지 말고 문맥에 따라 자연스럽게 녹여내세요.
               - 문장은 호흡이 짧고 읽기 편하게 작성하세요.
            
            [응답 포맷 (JSON)]
            {
                "titles": ["제목1", "제목2", "제목3"],
                "body": "안녕하세요! ... (마크다운 기호 없는 순수 줄글)"
            }
        `;
    }

    // 5. Render Results
    function renderResults(data) {
        // Titles
        titlesContainer.innerHTML = '';
        if (data.titles && Array.isArray(data.titles)) {
            data.titles.forEach((title) => {
                const card = document.createElement('div');
                card.className = 'title-card';
                card.innerHTML = `
                    <span class="title-text">${title}</span>
                    <button class="btn-copy" onclick="window.copyToClipboard('${title.replace(/'/g, "\\'")}')">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                `;
                titlesContainer.appendChild(card);
            });
        }

        // Body
        if (data.body) {
            contentBody.innerHTML = marked.parse(data.body);
            contentBody.dataset.fullText = data.body;
        }
    }

    // 6. UI State Helpers
    function setLoading(loading) {
        if (loading) {
            emptyState.classList.add('hidden');
            resultState.classList.add('hidden');
            loadingState.classList.remove('hidden');
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<span class="loader" style="width: 20px; height: 20px; border-width: 2px;"></span> 생성 중...';
        } else {
            loadingState.classList.add('hidden');
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<span class="btn-text">콘텐츠 생성하기</span><span class="btn-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>';
        }
    }

    function showResults() {
        resultState.classList.remove('hidden');
        if (window.innerWidth <= 1024) {
            resultState.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // 7. Utilities & Refine
    window.copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast();
        });
    };

    copyBodyBtn.addEventListener('click', () => {
        const textToCopy = contentBody.dataset.fullText || contentBody.innerText;
        window.copyToClipboard(textToCopy);
    });

    function showToast() {
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    refineToggle.addEventListener('click', () => {
        refineArea.classList.toggle('hidden');
    });

    // Refine Logic
    refineBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('refine-prompt').value;
        if (!prompt) return;

        const originalBtnText = refineBtn.innerText;
        refineBtn.innerText = '수정 중...';
        refineBtn.disabled = true;

        try {
            const currentBody = contentBody.dataset.fullText;
            const refinePrompt = `
                기존 블로그 글을 사용자의 요청에 맞춰 수정하세요.
                
                [사용자 요청]
                ${prompt}

                [기존 글]
                ${currentBody}

                - 마크다운 기호(##, **)를 절대 포함하지 마세요.

                [응답 포맷 (JSON)]
                {
                    "body": "수정된 전체 본문 (마크다운 기호 제외)"
                }
                
                JSON형식으로만 응답하세요.
            `;

            const data = await executePrompt(refinePrompt);
            if (data.body) {
                updateRefineResult(data.body);
            }

            if (data.usedModel) {
                document.getElementById('used-model-name').innerText = data.usedModel;
            }

        } catch (error) {
            console.error(error);
            alert('수정 중 오류가 발생했습니다: ' + error.message);
        } finally {
            refineBtn.innerText = originalBtnText;
            refineBtn.disabled = false;
        }
    });

    function updateRefineResult(newBody) {
        contentBody.innerHTML = marked.parse(newBody);
        contentBody.dataset.fullText = newBody;
        document.getElementById('refine-prompt').value = '';
        refineArea.classList.add('hidden');
    }
});
