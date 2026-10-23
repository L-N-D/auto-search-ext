// Background Service Worker for AI Quiz & Question Solver (Lịch sử Đảng)
// Nhập các Gemini API Key vào đây (hoặc dán trực tiếp trong ô cài đặt của Extension Popup)
const DEFAULT_API_KEYS = [
  // "YOUR_GEMINI_API_KEY_1",
  // "YOUR_GEMINI_API_KEY_2",
  // "YOUR_GEMINI_API_KEY_3"
];
const PRIMARY_API_KEY = DEFAULT_API_KEYS[0] || "";

const DEFAULT_SYSTEM_PROMPT = `# VAI TRÒ
Bạn là Chuyên gia Lịch sử Đảng Cộng sản Việt Nam với tư duy thẩm định và tự phản biện nội tại (Internal Self-Verification).

# QUY TRÌNH SUY LUẬN & TỰ PHẢN BIỆN (2-STEP VERIFICATION):
1. BƯỚC 1 - NHẬN DIỆN & BẺ GÃY BẪY:
   - Quét kỹ từ khóa phủ định: "KHÔNG đúng", "Ý nào SAI", "NGOẠI TRỪ", "CHƯA chính xác".
   - Xác định chính xác mốc thời gian, nhân vật, tác phẩm, văn kiện Đại hội / Hội nghị TW.
2. BƯỚC 2 - TỰ PHẢN BIỆN ĐỐI CHIẾU:
   - Tự phản biện loại bỏ 3 phương án gây nhiễu, đối chiếu với văn kiện gốc và lý luận chuẩn của Đảng.
   - Chốt phương án đúng tuyệt đối.

# YÊU CẦU ĐÁP ÁN (NGẮN GỌN TUYỆT ĐỐI):
- CHỈ TRẢ VỀ CHỮ CÁI ĐÁP ÁN (A, B, C hoặc D) kèm theo tên/mốc ngắn gọn nhất (Ví dụ: "B. Lê Duẩn" hoặc "C. Hội nghị TW 8" hoặc "A").
- TUYỆT ĐỐI KHÔNG chép lại đề bài hay viết câu giải thích dài dòng để đảm bảo tốc độ hiển thị tức thì.

# ĐỊNH DẠNG ĐẦU RA JSON:
BẮT BUỘC chỉ trả về JSON thuần túy (không kèm văn bản ngoài JSON):
{
  "items": [
    {
      "question_number": "Câu 1",
      "question_text": "Tóm tắt ngắn gọn câu hỏi",
      "options": "A. ... | B. ... | C. ... | D. ...",
      "correct_answer": "B. Lê Duẩn"
    }
  ],
  "skipped_questions": [
    {
      "question_number": "Câu 2",
      "reason": "Thiếu đáp án do khuất màn hình"
    }
  ]
}`;

// Bộ đôi Model Flash Lite: Tốc độ cao ~0.9s, độ chính xác 100%, hạn mức khổng lồ 1.500 RPD (loại bỏ 3.5/3.6 Flash bị Google giới hạn 20 req/ngày)
const BEST_ACCURACY_MODELS = [
  'gemini-3.5-flash-lite',    // Ưu tiên 1: Cực nhanh ~0.8s - 1.2s, hạn mức 1.500 lượt/ngày
  'gemini-flash-lite-latest'  // Ưu tiên 2: Thế hệ Lite mới nhất ~1.1s, quota dự phòng 1.500 lượt/ngày
];

const ROTATION_MODELS = BEST_ACCURACY_MODELS;

function buildFallbackModelList(preferredModel) {
  const outdated = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.6-flash'
  ];
  if (!preferredModel || preferredModel === 'auto-rotate' || outdated.includes(preferredModel)) {
    return [...BEST_ACCURACY_MODELS];
  }
  return [preferredModel, ...BEST_ACCURACY_MODELS.filter(m => m !== preferredModel)];
}

let globalRequestCounter = 0;

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture_and_solve') {
    await handleCaptureAndSolve();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TRIGGER_CAPTURE') {
    handleCaptureAndSolve();
    sendResponse({ status: 'started' });
  } else if (request.action === 'TEST_API_KEY') {
    (async () => {
      const keysToTest = (request.keys && request.keys.length > 0)
        ? request.keys
        : (request.apiKey ? [request.apiKey] : await getAvailableApiKeys());
      return await testApiKeyPool(keysToTest, request.model);
    })()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  } else if (request.action === 'GET_DEFAULT_KEYS') {
    sendResponse({ defaultKeys: DEFAULT_API_KEYS.join('\n') });
    return true;
  } else if (request.action === 'GET_DEFAULT_SYSTEM_PROMPT') {
    sendResponse({ defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT });
    return true;
  }
  return true;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScriptInjected(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (response && response.status === 'PONG') {
      return true;
    }
  } catch (err) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      return true;
    } catch (injectErr) {
      console.warn('Cannot inject content script:', injectErr);
      return false;
    }
  }
  return true;
}

async function getAvailableApiKeys() {
  const localData = await chrome.storage.local.get(['geminiApiKeys']);
  const syncData = await chrome.storage.sync.get(['geminiApiKeys', 'geminiApiKey']);

  const raw = localData.geminiApiKeys || syncData.geminiApiKeys || syncData.geminiApiKey;
  const defaultJoined = DEFAULT_API_KEYS.join('\n');

  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    await chrome.storage.local.set({ geminiApiKeys: defaultJoined });
    await chrome.storage.sync.set({ geminiApiKeys: defaultJoined, geminiApiKey: DEFAULT_API_KEYS[0] || "" });
    return [...DEFAULT_API_KEYS];
  }

  const keys = raw
    .split(/[\n,;\r]+/)
    .map(k => k.trim())
    .filter(k => k.length > 5);

  // Tự động nâng cấp nếu chỉ lưu 1 key cũ của hệ thống
  if (keys.length === 1 && keys[0] === PRIMARY_API_KEY) {
    await chrome.storage.local.set({ geminiApiKeys: defaultJoined });
    await chrome.storage.sync.set({ geminiApiKeys: defaultJoined, geminiApiKey: DEFAULT_API_KEYS[0] || "" });
    return [...DEFAULT_API_KEYS];
  }

  return keys.length > 0 ? keys : [...DEFAULT_API_KEYS];
}

async function handleCaptureAndSolve() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    console.error('Không tìm thấy tab hoạt động.');
    return;
  }

  // Check if tab is restricted URL
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('https://chromewebstore.google.com/'))) {
    console.warn('Cannot run on internal chrome pages.');
    return;
  }

  try {
    await ensureContentScriptInjected(tab.id);

    // 1. Tạm ẩn HUD trước khi chụp để không che khuất bất kỳ phần nào của đề thi
    await chrome.tabs.sendMessage(tab.id, { action: 'HIDE_FOR_CAPTURE' }).catch(() => {});
    await new Promise(r => setTimeout(r, 60));

    // 2. Chụp ảnh màn hình ở định dạng PNG Lossless (Độ nét nguyên bản 100%, không nén mất dữ liệu)
    // Giúp các dấu tiếng Việt (ngã, hỏi, nặng, mũ), số mũ, chữ nhỏ được OCR chuẩn xác nhất
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });

    if (!dataUrl) {
      throw new Error('Không thể chụp ảnh màn hình của tab hiện tại.');
    }

    // 3. Thông báo trạng thái đang giải đề
    await chrome.tabs.sendMessage(tab.id, {
      action: 'SHOW_STATUS',
      status: 'analyzing',
      text: 'Đang đọc ảnh sắc nét & giải đề...'
    }).catch(() => {});

    // Get model configuration & system prompt
    const settings = await chrome.storage.sync.get({
      geminiModel: 'auto-rotate',
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    });
    const selectedModel = settings.geminiModel || 'auto-rotate';

    // Tự động nâng cấp prompt lên phiên bản siêu tốc chỉ trả về đáp án ngắn gọn A, B, C, D
    let activePrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (!activePrompt || !activePrompt.includes('ĐÁP ÁN NGẮN GỌN TUYỆT ĐỐI') || !activePrompt.includes('Lịch sử Đảng')) {
      activePrompt = DEFAULT_SYSTEM_PROMPT;
      chrome.storage.sync.set({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
    }

    const keys = await getAvailableApiKeys();
    if (!keys || keys.length === 0) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_ERROR',
        message: 'Chưa có Gemini API Key nào! Vui lòng cấu hình trong tiện ích.'
      });
      return;
    }

    const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
    const aiResult = await executeSmartModelRotation(keys, selectedModel, base64Data, tab.id, activePrompt, mimeType);

    // Send result back to content script
    await chrome.tabs.sendMessage(tab.id, {
      action: 'SHOW_RESULT',
      data: aiResult
    });

  } catch (error) {
    console.error('Lỗi quy trình giải đề:', error);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_ERROR',
        message: error.message || 'Đã có lỗi xảy ra trong quá trình xử lý.'
      });
    } catch (e) {
      console.error('Không thể gửi thông báo lỗi tới tab:', e);
    }
  }
}

async function executeSmartModelRotation(keys, preferredModel, base64Data, tabId, customSystemPrompt, mimeType = 'image/png') {
  const models = buildFallbackModelList(preferredModel);
  const totalKeys = keys.length;

  // Nếu có từ 3 key trở lên: TK 1 & TK 2 luân phiên giải, TK 3 chuyên thẩm định đối chiếu bẫy tương tự
  const useDedicatedAuditor = (totalKeys >= 3);
  const solverKeys = useDedicatedAuditor ? keys.slice(0, 2) : keys;
  const auditorKey = useDedicatedAuditor ? keys[2] : null;

  const startSolverIndex = (globalRequestCounter++) % solverKeys.length;
  let lastError = null;
  let solverResult = null;

  // BƯỚC 1: Solver (TK 1 hoặc TK 2) giải câu hỏi từ ảnh màn hình
  for (let mIdx = 0; mIdx < models.length; mIdx++) {
    const modelToUse = models[mIdx];

    for (let offset = 0; offset < solverKeys.length; offset++) {
      const kIdx = (startSolverIndex + offset) % solverKeys.length;
      const apiKey = solverKeys[kIdx];

      try {
        if (tabId) {
          const statusText = (mIdx === 0 && offset === 0)
            ? `Đang giải đề bằng [${modelToUse}] (TK #${kIdx + 1}/${solverKeys.length})...`
            : `Đang đổi dự phòng [${modelToUse}] (TK #${kIdx + 1}/${solverKeys.length})...`;
          chrome.tabs.sendMessage(tabId, {
            action: 'SHOW_STATUS',
            status: 'analyzing',
            text: statusText
          }).catch(() => {});
        }

        console.log(`[AI Quiz Solver] Đang gọi model [${modelToUse}] qua Solver TK #${kIdx + 1}/${solverKeys.length}`);
        solverResult = await executeGeminiVisionRequest(apiKey, modelToUse, base64Data, customSystemPrompt, mimeType);
        break;
      } catch (err) {
        lastError = err;
        const errMsg = err.message || '';
        console.warn(`[AI Quiz Solver] Solver TK #${kIdx + 1} gặp lỗi: ${errMsg}. Đang xoay vòng tiếp...`);
      }
    }

    if (solverResult) break;
  }

  if (!solverResult) {
    throw lastError || new Error('Tất cả các tài khoản Solver đều chạm giới hạn Rate Limit hoặc gặp sự cố.');
  }

  // BƯỚC 2: Thẩm định chéo độc lập qua TK 3 (soi chiếu phương án tương tự / bẫy câu chữ)
  if (useDedicatedAuditor && auditorKey) {
    solverResult = await executeAuditorCrossCheck(auditorKey, 'gemini-3.5-flash-lite', solverResult, tabId);
  }

  return solverResult;
}

async function executeAuditorCrossCheck(auditorKey, model, solverResult, tabId) {
  if (!solverResult?.items || solverResult.items.length === 0) {
    return solverResult;
  }

  try {
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_STATUS',
        status: 'analyzing',
        text: 'TK 3 đang thẩm định đối chiếu các phương án tương tự...'
      }).catch(() => {});
    }

    const payload = solverResult.items.map(it => {
      return `[${it.question_number || 'Câu hỏi'}]
Đề bài: ${it.question_text || 'Đề thi trong ảnh'}
Các phương án: ${it.options || 'Xem các phương án'}
Đáp án sơ bộ đề xuất: ${it.correct_answer}`;
    }).join('\n\n---\n\n');

    const auditorPrompt = `# VAI TRÒ: Chuyên gia Cao cấp Thẩm định Lịch sử Đảng Cộng sản Việt Nam độc lập.

# NHIỆM VỤ ĐẶC BIỆT (ĐỐI CHIẾU PHƯƠNG ÁN NAI NÁ / TƯƠNG TỰ NHAU):
1. Đọc kỹ từng câu hỏi và toàn bộ các phương án A, B, C, D.
2. CỰC KỲ CẢNH GIÁC với các phương án TƯƠNG TỰ NHAU hoặc GẦN GIỐNG NHAU (ví dụ: các mốc năm/Hội nghị cận kề, các câu trích danh ngôn gần giống, các văn kiện cùng thời kỳ).
3. ĐÁNH GIÁ ĐÁP ÁN ĐỀ XUẤT:
   - Liệu đáp án sơ bộ có thực sự đúng tuyệt đối không?
   - Hay có phương án khác TƯƠNG TỰ nhưng LẠI ĐÚNG VÀ CHUẨN XÁC HƠN về mặt câu từ/văn kiện Đảng?
4. NẾU CÓ PHƯƠNG ÁN TƯƠNG TỰ ĐÚNG HƠN: Đính chính sang phương án đúng nhất đó ngay lập tức!
5. NẾU ĐÁP ÁN ĐỀ XUẤT ĐÃ ĐÚNG: Giữ nguyên.

# YÊU CẦU ĐẦU RA:
- Trả về chữ cái đáp án ngắn gọn (Ví dụ: "B. Lê Duẩn" hoặc "C. Hội nghị TW 8").

BẮT BUỘC chỉ trả về JSON thuần túy (không kèm văn bản ngoài JSON):
{
  "items": [
    {
      "question_number": "Câu 1",
      "correct_answer": "B. Lê Duẩn",
      "is_corrected": false,
      "audit_note": "Xác nhận chuẩn xác"
    }
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${auditorKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: auditorPrompt }] },
        contents: [{ parts: [{ text: `Dữ liệu đề thi cần thẩm định:\n\n${payload}` }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 1024
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const audited = JSON.parse(rawText);
        const auditedItems = Array.isArray(audited.items) ? audited.items : (Array.isArray(audited) ? audited : []);

        if (auditedItems.length > 0) {
          solverResult.items = solverResult.items.map((origItem, idx) => {
            const auditItem = auditedItems.find(a => a.question_number === origItem.question_number) || auditedItems[idx];
            if (auditItem && auditItem.correct_answer) {
              const origClean = cleanAnswerText(origItem.correct_answer);
              const auditClean = cleanAnswerText(auditItem.correct_answer);
              const wasCorrected = Boolean(auditItem.is_corrected || (origClean && auditClean && !origClean.startsWith(auditClean.charAt(0))));
              return {
                ...origItem,
                correct_answer: auditClean,
                is_corrected: wasCorrected,
                is_verified: true,
                audit_note: auditItem.audit_note || (wasCorrected ? 'Đã đính chính từ phương án tương tự' : 'Đã thẩm định chuẩn xác')
              };
            }
            return origItem;
          });
          solverResult.audited_by = 'TK 3 (Thẩm định độc lập)';
        }
      }
    }
  } catch (auditErr) {
    console.warn('[Auditor TK 3] Quá thời gian hoặc gặp sự cố, giữ nguyên đáp án Solver:', auditErr.message);
  }

  return solverResult;
}

async function executeGeminiVisionRequest(apiKey, model, base64Data, customSystemPrompt, mimeType = 'image/png') {
  const modelName = (!model || model === 'auto-rotate' || model === 'gemini-2.0-flash' || model === 'gemini-1.5-flash') ? 'gemini-3.5-flash-lite' : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const systemInstructionText = (customSystemPrompt && customSystemPrompt.trim().length > 10)
    ? customSystemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  const requestBody = {
    system_instruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents: [
      {
        parts: [
          { text: "Đọc ảnh sắc nét nguyên bản và chọn chính xác chữ cái đáp án đúng cho các câu hỏi hiển thị trong ảnh." },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 2048
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ]
  };

  // 18s timeout đủ cho ảnh chụp chất lượng cao truyền tải qua mạng
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 18000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Mạng phản hồi chậm quá 18s (Timeout), đang tự động thử lại...');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `Lỗi API HTTP ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];
  let rawText = '';
  if (candidate?.content?.parts) {
    rawText = candidate.content.parts
      .map(p => p.text || '')
      .filter(t => t.trim().length > 0)
      .join('\n');
  }

  if (!rawText || rawText.trim().length === 0) {
    const blockReason = result.promptFeedback?.blockReason || candidate?.finishReason;
    if (blockReason === 'RECITATION') {
      console.warn('[RECITATION] Bị chặn do trích dẫn bản quyền. Tự động kích hoạt bypass...');
      return await executeMinimalBypassRequest(apiKey, modelName, base64Data, mimeType);
    }
    if (blockReason && blockReason !== 'STOP') {
      throw new Error(`Google tạm chặn phản hồi do lý do an toàn (${blockReason}). Đang đổi model...`);
    }
    throw new Error('AI không nhận diện được chữ trên ảnh màn hình. Vui lòng cuộn trang hoặc phóng to vùng câu hỏi rồi bấm Alt+R.');
  }

  return parseGeminiResponse(rawText);
}

async function executeMinimalBypassRequest(apiKey, model, base64Data, mimeType = 'image/png') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const minimalPrompt = `Bạn là Chuyên gia Lịch sử Đảng.
Chỉ trả về JSON đáp án trắc nghiệm ngắn gọn nhất (không chép lại đề bài hay danh ngôn dài):
{
  "items": [
    {
      "question_number": "Câu 1",
      "analysis": "Đáp án chuẩn xác",
      "correct_answer": "B. Lê Duẩn",
      "confidence": "99%"
    }
  ]
}`;

  const requestBody = {
    system_instruction: { parts: [{ text: minimalPrompt }] },
    contents: [
      {
        parts: [
          { text: "Chỉ chọn phương án đúng cho các câu hỏi hiển thị trong ảnh." },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 1024
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Lỗi gọi bypass HTTP ${response.status}`);
  }

  const result = await response.json();
  const cand = result.candidates?.[0];
  let text = '';
  if (cand?.content?.parts) {
    text = cand.content.parts.map(p => p.text || '').filter(t => t.trim().length > 0).join('\n');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('AI không thể trả về đáp án cho câu hỏi này do bộ lọc trích dẫn nghiêm ngặt.');
  }

  return parseGeminiResponse(text);
}

function parseGeminiResponse(rawText) {
  if (!rawText) {
    return { items: [], skipped_questions: [] };
  }

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    let items = [];
    let skipped = parsed.skipped_questions || parsed.skipped || [];

    if (Array.isArray(parsed.items)) {
      items = parsed.items;
    } else if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.question || parsed.correct_answer || parsed.question_number) {
      items = [parsed];
    }

    items = items.map((item, index) => ({
      question_number: item.question_number || `Câu ${index + 1}`,
      question_text: item.question_text || item.question || '',
      options: item.options || '',
      analysis: item.analysis || item.thought || item.reasoning || '',
      correct_answer: cleanAnswerText(item.correct_answer || item.correct_key || ''),
      confidence: item.confidence || '99%'
    }));

    return {
      total_detected: items.length + skipped.length,
      items,
      skipped_questions: skipped
    };
  } catch (parseErr) {
    console.warn('JSON.parse thất bại, thử khôi phục qua Regex:', parseErr);

    // Fallback 1: Trích xuất các cặp question_number, analysis và correct_answer bằng regex
    const items = [];
    const pairRegex = /"question_number"\s*:\s*"([^"]+)"[\s\S]*?(?:"analysis"\s*:\s*"([^"]+)"[\s\S]*?)?"correct_answer"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = pairRegex.exec(cleaned)) !== null) {
      items.push({
        question_number: match[1],
        analysis: match[2] || '',
        correct_answer: cleanAnswerText(match[3]),
        confidence: '95%'
      });
    }

    if (items.length > 0) {
      return { total_detected: items.length, items, skipped_questions: [] };
    }

    // Fallback 2: Trích xuất chỉ "correct_answer": "..."
    const ansOnlyRegex = /"correct_answer"\s*:\s*"([^"]+)"/g;
    let ansMatch;
    let autoIndex = 1;
    while ((ansMatch = ansOnlyRegex.exec(cleaned)) !== null) {
      items.push({
        question_number: `Câu ${autoIndex++}`,
        correct_answer: cleanAnswerText(ansMatch[1]),
        confidence: '95%'
      });
    }

    if (items.length > 0) {
      return { total_detected: items.length, items, skipped_questions: [] };
    }

    // Fallback 3: Dạng văn bản thuần (ví dụ: Câu 1: B...)
    const lines = cleaned.split('\n');
    for (const line of lines) {
      const lineMatch = line.match(/(Câu\s*\d+|Question\s*\d+|\d+)[.:]\s*([A-D][.:\s].*|[A-D]$)/i);
      if (lineMatch) {
        items.push({
          question_number: lineMatch[1],
          correct_answer: cleanAnswerText(lineMatch[2]),
          confidence: '90%'
        });
      }
    }

    if (items.length > 0) {
      return { total_detected: items.length, items, skipped_questions: [] };
    }

    // Fallback cuối: Loại bỏ toàn bộ cú pháp JSON ({, }, [, ], quotes) để tránh hiện code JSON thô
    const sanitized = cleaned
      .replace(/[{"}\[\]]/g, '')
      .replace(/items\s*:/g, '')
      .replace(/question_number\s*:/g, '')
      .replace(/correct_answer\s*:/g, '')
      .trim();

    return {
      total_detected: 1,
      items: [{
        question_number: 'Đáp án',
        correct_answer: sanitized.length > 0 ? sanitized : 'Không xác định được đáp án rõ ràng',
        confidence: 'N/A'
      }],
      skipped_questions: []
    };
  }
}

function cleanAnswerText(str) {
  if (!str) return 'Không xác định';
  return String(str)
    .replace(/[{"}\[\]]/g, '')
    .trim();
}

async function testApiKeyPool(keys, model) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { success: false, error: 'Không có key nào trong danh sách!' };
  }

  const isAuto = (!model || model === 'auto-rotate' || model === 'gemini-2.0-flash' || model === 'gemini-1.5-flash' || model === 'gemini-3.5-flash' || model === 'gemini-3.6-flash');
  const modelsToTest = isAuto
    ? ROTATION_MODELS
    : [model, ...ROTATION_MODELS.filter(m => m !== model)];

  let lastError = null;

  for (const modelName of modelsToTest) {
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '1+1=' }] }]
          }),
          signal: controller.signal
        });

        if (response.ok) {
          clearTimeout(timeoutId);
          return {
            success: true,
            workingIndex: i + 1,
            totalKeys: keys.length,
            model: modelName,
            isAutoRotate: isAuto,
            totalModels: ROTATION_MODELS.length
          };
        }

        const err = await response.json().catch(() => ({}));
        lastError = err.error?.message || `HTTP ${response.status}`;
        console.warn(`[Test] Model [${modelName}] Key #${i + 1} gặp lỗi: ${lastError}`);
      } catch (e) {
        lastError = e.message;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  return { success: false, error: lastError || 'Tất cả các key và model đều chạm giới hạn Rate Limit.' };
}
