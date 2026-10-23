// Popup Logic for AI Quiz Solver with Multi-Key Rotation Support

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeysArea = document.getElementById('apiKeysArea');
  const keysBadge = document.getElementById('keysBadge');
  const btnResetDefaultKeys = document.getElementById('btnResetDefaultKeys');
  const modelSelect = document.getElementById('modelSelect');
  const btnSave = document.getElementById('btnSave');
  const btnTestKey = document.getElementById('btnTestKey');
  const testSpinner = document.getElementById('testSpinner');
  const testBtnText = document.getElementById('testBtnText');
  const statusAlert = document.getElementById('statusAlert');
  const btnTriggerCapture = document.getElementById('btnTriggerCapture');

  function parseKeys(text) {
    if (!text) return [];
    return text
      .split(/[\n,;\r]+/)
      .map(k => k.trim())
      .filter(k => k.length > 5);
  }

  function updateKeysBadge() {
    const keys = parseKeys(apiKeysArea.value);
    if (keys.length === 3) {
      keysBadge.textContent = `3 Keys (3 Tài khoản)`;
      keysBadge.style.color = '#38bdf8';
      keysBadge.style.borderColor = 'rgba(56, 189, 248, 0.5)';
    } else if (keys.length > 0) {
      keysBadge.textContent = `${keys.length} ${keys.length === 1 ? 'Key' : 'Keys'}`;
      keysBadge.style.color = '#34d399';
      keysBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      keysBadge.textContent = 'Chưa có Key';
      keysBadge.style.color = '#f87171';
      keysBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
  }

  // System Prompt elements
  const systemPromptArea = document.getElementById('systemPromptArea');
  const btnResetSystemPrompt = document.getElementById('btnResetSystemPrompt');

  // Load saved settings
  const localData = await chrome.storage.local.get(['geminiApiKeys']);
  const syncData = await chrome.storage.sync.get(['geminiApiKeys', 'geminiModel', 'systemPrompt']);

  const outdatedModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.6-flash'
  ];
  if (syncData.geminiModel && !outdatedModels.includes(syncData.geminiModel)) {
    modelSelect.value = syncData.geminiModel;
  } else {
    modelSelect.value = 'auto-rotate';
    chrome.storage.sync.set({ geminiModel: 'auto-rotate' });
  }

  // Load System Prompt (auto-upgrade to specialized Lịch sử Đảng 2-step verification prompt)
  chrome.runtime.sendMessage({ action: 'GET_DEFAULT_SYSTEM_PROMPT' }, (res) => {
    const defaultPrompt = res?.defaultSystemPrompt || '';
    if (!syncData.systemPrompt || !syncData.systemPrompt.includes('2-STEP VERIFICATION') || !syncData.systemPrompt.includes('Lịch sử Đảng')) {
      systemPromptArea.value = defaultPrompt;
      chrome.storage.sync.set({ systemPrompt: defaultPrompt });
    } else {
      systemPromptArea.value = syncData.systemPrompt;
    }
  });

  const existingKeys = localData.geminiApiKeys || syncData.geminiApiKeys;
  const parsed = parseKeys(existingKeys);
  if (parsed.length > 1) {
    apiKeysArea.value = parsed.join('\n');
    updateKeysBadge();
  } else {
    // Request all 3 default keys from background
    chrome.runtime.sendMessage({ action: 'GET_DEFAULT_KEYS' }, (res) => {
      if (res && res.defaultKeys) {
        apiKeysArea.value = res.defaultKeys;
        chrome.storage.local.set({ geminiApiKeys: res.defaultKeys });
        chrome.storage.sync.set({ geminiApiKeys: res.defaultKeys, geminiApiKey: res.defaultKeys.split('\n')[0] });
        updateKeysBadge();
      }
    });
  }

  // Live key count update
  apiKeysArea.addEventListener('input', updateKeysBadge);

  // Reset to default key
  btnResetDefaultKeys.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'GET_DEFAULT_KEYS' }, (res) => {
      if (res && res.defaultKeys) {
        apiKeysArea.value = res.defaultKeys;
        updateKeysBadge();
        showAlert('Đã nạp lại API key chuẩn vào ô nhập liệu!', 'success');
      }
    });
  });

  // Reset to default System Prompt
  btnResetSystemPrompt.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'GET_DEFAULT_SYSTEM_PROMPT' }, (res) => {
      if (res && res.defaultSystemPrompt) {
        systemPromptArea.value = res.defaultSystemPrompt;
        showAlert('Đã khôi phục System Prompt tối ưu mặc định!', 'success');
      }
    });
  });

  // Save settings
  btnSave.addEventListener('click', async () => {
    const rawText = apiKeysArea.value.trim();
    const keys = parseKeys(rawText);
    const model = modelSelect.value;

    if (keys.length === 0) {
      showAlert('Vui lòng nhập ít nhất 1 API Key hợp lệ!', 'error');
      return;
    }

    const cleanJoined = keys.join('\n');

    // Save in local storage (large quota) and sync
    const customPrompt = systemPromptArea.value.trim();
    await chrome.storage.local.set({ geminiApiKeys: cleanJoined });
    await chrome.storage.sync.set({
      geminiApiKeys: cleanJoined,
      geminiApiKey: keys[0],
      geminiModel: model,
      systemPrompt: customPrompt
    });

    const accountMsg = keys.length === 3 ? '3 tài khoản (45 RPM) cân bằng tải tối ưu' : `${keys.length} keys xoay vòng`;
    showAlert(`✓ Đã lưu thành công! Đang kích hoạt ${accountMsg}.`, 'success');
  });

  // Test API Key
  btnTestKey.addEventListener('click', async () => {
    const keys = parseKeys(apiKeysArea.value);
    const model = modelSelect.value;

    if (keys.length === 0) {
      showAlert('Vui lòng nhập ít nhất 1 API Key để kiểm tra!', 'error');
      return;
    }

    testSpinner.classList.remove('hidden');
    testBtnText.textContent = 'Đang thử...';
    btnTestKey.disabled = true;
    hideAlert();

    try {
      chrome.runtime.sendMessage(
        { action: 'TEST_API_KEY', keys: keys, model: model },
        (response) => {
          testSpinner.classList.add('hidden');
          testBtnText.textContent = 'Kiểm tra kết nối';
          btnTestKey.disabled = false;

          if (response && response.success) {
            const detail = response.isAutoRotate
              ? `Chế độ tự động xoay vòng sẵn sàng (${response.totalModels} models x ${response.totalKeys} keys). Key #${response.workingIndex} kết nối tốt với ${response.model}.`
              : `Key #${response.workingIndex}/${response.totalKeys} hoạt động tốt (${response.model}).`;
            showAlert(`✓ Kết nối thành công! ${detail}`, 'success');
          } else {
            const err = response?.error || 'Không thể kết nối tới Google Gemini.';
            showAlert(`✕ Lỗi kết nối: ${err}`, 'error');
          }
        }
      );
    } catch (e) {
      testSpinner.classList.add('hidden');
      testBtnText.textContent = 'Kiểm tra kết nối';
      btnTestKey.disabled = false;
      showAlert(`✕ Lỗi: ${e.message}`, 'error');
    }
  });

  // Quick Action: Capture and solve
  btnTriggerCapture.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TRIGGER_CAPTURE' });
    // Close popup immediately so popup window is not captured in screenshot
    window.close();
  });

  function showAlert(msg, type) {
    statusAlert.textContent = msg;
    statusAlert.className = `alert ${type}`;
    statusAlert.classList.remove('hidden');
  }

  function hideAlert() {
    statusAlert.classList.add('hidden');
  }
});
