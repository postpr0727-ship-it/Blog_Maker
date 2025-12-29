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
    const personaAgeInput = document.getElementById('persona-age');
    const personaJobInput = document.getElementById('persona-job');
    const personaGenderInput = document.getElementById('persona-gender');
    const topicPromptInput = document.getElementById('topic-prompt');
    const refLinks = document.querySelectorAll('.ref-link');

    // State
    let isGenerating = false;

    // --- Helper Functions ---

    // Safe HTML escaping to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Copy to clipboard utility
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast();
        });
    }

    // --- Core Functions ---

    // 1. Generate Handler
    generateBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (!mainKeywordInput.value.trim()) {
            alert('핵심 키워드를 입력해주세요.');
            mainKeywordInput.focus();
            return;
        }

        setLoading(true);

        try {
            const formData = getFormData();
            const data = await callGeminiAPI(formData);
            renderResults(data);
            setLoading(false);
            showResults();

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
            mood: document.querySelector('input[name="mood"]:checked').value,
            length: document.querySelector('input[name="length"]:checked').value,
            writingStyle: document.querySelector('input[name="writing-style"]:checked').value,
            prompt: topicPromptInput.value.trim(),
            links: Array.from(refLinks).map(input => input.value.trim()).filter(url => url)
        };
    }

    // 3. Prompt Builder
    function buildPrompt(data) {
        return `
            당신은 네이버 블로그 콘텐츠 최적화 전문가입니다. 
            주어진 페르소나와 키워드 정보를 바탕으로 블로그 포스팅을 작성하세요.
            이후 제공되는 [참고 자료 원문] 섹션의 데이터를 기반으로 실생활에 밀착된 정보를 제공해야 합니다.
            반드시 아래 JSON 형식으로만 응답해야 합니다. 마크다운 코드블록(\`\`\`json)을 사용하지 말고 순수 JSON만 반환하세요.

            [페르소나 설정]
            - 이름: ${data.name}
            - 성별/나이: ${data.gender}, ${data.age}
            - 직업: ${data.job}
            - 기분/톤: ${data.mood} (happy: 밝고 명랑한, calm: 차분하고 감성적인, excited: 열정적이고 흥분된, informative: 전문적이고 객관적인)

            [콘텐츠 설정]
            - 핵심 키워드: ${data.keyword}
            - 추가 요청사항: ${data.prompt}
            - 어체(말투): ${data.writingStyle === 'conversational' ? '구어체 (친근한 대화형식, ~해요, ~했나요? 등)' : '문어체 (소설이나 일기 같은 반말 독백 형식, ~다, ~했다, ~한다 등)'}
            - 길이: ${data.length} (short: 공백제외 1000자 내외, medium: 2000자 내외, long: 3000자 이상)

            [작성 지침 - 절대 준수]
            1. **데이터 근거 (Zero-Hallucination)**: 반드시 제공되는 [참고 자료 원문]의 내용에서만 정보를 추출하여 작성하세요. 
            2. **일반 지식 배제**: 당신이 원래 알고 있던 지식이나 학습된 데이터를 사용하지 마세요. 오직 해당 텍스트에 명시된 사실, 수치, 내용만 사용해야 합니다. 
            3. **추측 금지**: 텍스트에 없는 정보를 지어내거나 추측하여 보충하지 마세요. 없는 내용은 언급하지 마세요.
            4. **출처 확인 불가 처리**: 만약 참고 자료 내용이 부족하거나 링크를 읽을 수 없다면, "제공된 참고 자료에서 관련 정보를 찾을 수 없습니다"라고만 답변하세요.
            5. **제목**: 네이버 검색(SEO)에 유리하고 클릭을 유도하는 제목 3개를 제안하세요. 제목에 핵심 키워드가 반드시 포함되어야 합니다. 단, 페르소나의 이름은 제목에 절대 포함하지 마세요.
            6. **본문**:
               - 서론-본론-결론 구조를 갖추세요.
               - 반드시 소제목을 작성하고, 각 소제목은 <h3>소제목 내용</h3> 형식으로 감싸서 구분하세요.
               - 강조가 필요한 부분은 <b>강조내용</b> 형식을 사용하세요.
               - 절대 **, ##, ### 와 같은 마크다운 기호를 사용하지 마세요. 모든 스타일링은 HTML 태그(<h3>, <b>)만 사용해야 합니다.
               - 페르소나의 말투(${data.writingStyle === 'conversational' ? '구어체' : '문어체(반말 독백)'}, 이모지 사용 등)를 반영하되, 이모지는 가독성을 해치지 않도록 적절히 절제하여 사용하세요 (문단당 1~2개 수준). ${data.mood === 'happy' ? '이모지를 조금 더 섞어 밝은 분위기를 내주되 남발하지 마세요.' : ''}
               - 핵심 키워드는 제목에만 필수적으로 포함시키고, 본문에서는 강제로 반복하지 말고 문맥에 따라 자연스럽게 녹여내세요.
               - 문장은 호흡이 짧고 읽기 편하게 작성하세요.
               - **어휘 다양성**: 동일하거나 유사한 어휘 및 종결 어미(예: '~가 기대된다', '~인 것 같다' 등)를 반복적으로 사용하지 마세요. 다채로운 표현을 사용하여 글의 완성도를 높이고 자연스럽게 작성하세요.
               - **어체 유지**: 선택된 어체(${data.writingStyle === 'conversational' ? '구어체' : '문어체(반말 독백)'})를 글 전체에서 일관되게 유지하세요. 문어체의 경우 반드시 반말(독백)을 사용하고 존댓말을 절대 사용하지 마세요.
            
            [응답 포맷 (JSON)]
            {
                "titles": ["내용에 기반한 제목1", "내용에 기반한 제목2", "내용에 기반한 제목3"],
                "body": "<h3>소제목1</h3>\\n참고 자료의 핵심 내용...\\n\\n<h3>소제목2</h3>...",
                "verification": [
                    { "fact": "언급된 주요 사실이나 수치", "source": "참고자료 1 (제목/URL)", "reason": "해당 자료의 어떤 부분에서 확인되었는지 간단히 설명" }
                ]
            }

            [교차검증(Cross-Verification) 지침]
            - 생성된 본문의 핵심적인 정보(수치, 사실, 주요 내용)들이 어느 참고 자료에서 왔는지 위의 verification 리스트에 최소 3개 이상 작성하세요.
            - 자료의 출처를 명확히 밝혀 사용자가 신뢰할 수 있도록 하세요.
        `;
    }

    // 4. API Calls
    async function callGeminiAPI(formData, retryModel = null) {
        const prompt = buildPrompt(formData);
        return await executePrompt(prompt, retryModel, formData.links);
    }

    async function executePrompt(prompt, retryModel = null, links = []) {
        const modelName = retryModel || 'gemini-1.5-flash';

        try {
            const resp = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model: modelName, links })
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
            if (e.message.includes('서버 응답 오류 (404)')) {
                throw new Error('API 경로(/api/generate)를 찾을 수 없습니다. Vercel 배포 상태를 확인해주세요.');
            }
            throw e;
        }
    }

    // 5. Render Results
    function renderResults(data) {
        if (data.titles && Array.isArray(data.titles)) {
            titlesContainer.innerHTML = '';
            data.titles.forEach((title) => {
                const card = document.createElement('div');
                card.className = 'title-card';

                const titleText = document.createElement('span');
                titleText.className = 'title-text';
                titleText.textContent = title; // Safe text content

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn-copy';
                copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                copyBtn.addEventListener('click', () => copyToClipboard(title));

                card.appendChild(titleText);
                card.appendChild(copyBtn);
                titlesContainer.appendChild(card);
            });
        }

        if (data.body) {
            // Use DOMPurify to sanitize HTML content
            const cleanHtml = DOMPurify.sanitize(data.body, {
                ALLOWED_TAGS: ['h3', 'b', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li'],
                ALLOWED_ATTR: []
            });
            contentBody.innerHTML = cleanHtml;
            contentBody.dataset.fullText = contentBody.innerText.trim();
        }

        // --- Cross-Verification Rendering ---
        const vReport = document.getElementById('verification-report');
        const vList = document.getElementById('verification-list');
        vList.innerHTML = '';

        if (data.verification && Array.isArray(data.verification) && data.verification.length > 0) {
            vReport.classList.remove('hidden');
            data.verification.forEach(item => {
                const vItem = document.createElement('div');
                vItem.className = 'verification-item';

                const vFact = document.createElement('div');
                vFact.className = 'v-fact';
                vFact.innerHTML = '<strong>사실 확인:</strong> ' + escapeHtml(item.fact);

                const vSource = document.createElement('div');
                vSource.className = 'v-source';
                vSource.innerHTML = '<strong>출처:</strong> ' + escapeHtml(item.source);

                const vReason = document.createElement('div');
                vReason.className = 'v-reason';
                vReason.innerHTML = '<strong>근거:</strong> ' + escapeHtml(item.reason);

                vItem.appendChild(vFact);
                vItem.appendChild(vSource);
                vItem.appendChild(vReason);
                vList.appendChild(vItem);
            });
        } else {
            vReport.classList.add('hidden');
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
    copyBodyBtn.addEventListener('click', () => {
        const textToCopy = contentBody.dataset.fullText || contentBody.innerText;
        copyToClipboard(textToCopy);
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

    refineBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('refine-prompt').value;
        if (!prompt) return;

        const originalBtnHTML = refineBtn.innerHTML;
        refineBtn.innerHTML = '<span class="loader" style="width: 16px; height: 16px; border-width: 2px; margin-right: 8px;"></span> 수정 중...';
        refineBtn.disabled = true;

        try {
            const currentBody = contentBody.dataset.fullText;
            const formData = getFormData(); // Get current form data including links
            const refinePrompt = `
                기존 블로그 글을 사용자의 요청에 맞춰 수정하세요.
                수정 시에도 반드시 **제공된 참고 자료 원문**의 내용만 활용하세요.
                절대 새로운 사실을 지어내거나 외부 지식을 섞지 마세요. 오직 팩트에 기반해야 합니다.
                반드시 소제목(<h3>태그)을 사용하여 문단을 구성하고 가독성을 좋게 만드세요.
                강조는 <b>태그를 사용하세요.
                이모지는 문단당 1~2개 정도로 절제하여 사용하세요.
                절대 **, ##, ### 와 같은 마크다운 기호를 사용하지 마세요.
                **어체 유지**: 사용자가 선택한 어체(${formData.writingStyle === 'conversational' ? '구어체' : '문어체(반말/독백)'})를 일관되게 유지하세요.

                [사용자 요청]
                ${prompt}

                [기존 글]
                ${currentBody}

                [응답 포맷 (JSON)]
                {
                    "body": "수정된 전체 본문 (<h3>, <b> 태그 포함)",
                    "verification": [
                        { "fact": "수정/추가된 주요 사실", "source": "참고자료 1 (제목/URL)", "reason": "근거 설명" }
                    ]
                }

                [교차검증 지침]
                수정된 글에서도 핵심 정보의 출처를 verification 리스트에 명시하세요.
            `;

            // Pass links to refine as well
            const data = await executePrompt(refinePrompt, null, formData.links);
            if (data.body) {
                renderResults(data); // Using renderResults instead of updateRefineResult to reuse verification rendering
                document.getElementById('refine-prompt').value = '';
                refineArea.classList.add('hidden');
            }
            if (data.usedModel) {
                document.getElementById('used-model-name').innerText = data.usedModel;
            }

        } catch (error) {
            console.error(error);
            alert('수정 중 오류가 발생했습니다: ' + error.message);
        } finally {
            refineBtn.innerHTML = originalBtnHTML;
            refineBtn.disabled = false;
        }
    });
});
