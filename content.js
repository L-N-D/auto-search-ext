// Content script for AI Quiz Solver - Minimal Fast HUD with 3s Auto-Dismiss & Hover Pause

(function () {
  if (window.__AI_QUIZ_SOLVER_INITIALIZED__) {
    return;
  }
  window.__AI_QUIZ_SOLVER_INITIALIZED__ = true;

  let hostContainer = null;
  let shadowRoot = null;
  let hudElement = null;
  let isDragging = false;
  let dragStartX, dragStartY, initialLeft, initialTop;
  let isMinimized = false;

  // Auto-dismiss Timer State
  const DISMISS_DURATION_MS = 3000;
  let dismissTimeout = null;
  let progressInterval = null;
  let isHovered = false;
  let isResultActive = false;

  function getOrCreateHUD() {
    if (hostContainer) return;

    hostContainer = document.createElement('div');
    hostContainer.id = 'ai-quiz-solver-host-root';
    document.documentElement.appendChild(hostContainer);

    shadowRoot = hostContainer.attachShadow({ mode: 'open' });

    // Link isolated stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    shadowRoot.appendChild(link);

    // Create Minimal Floating Card
    hudElement = document.createElement('div');
    hudElement.className = 'hud-wrapper hidden';
    hudElement.innerHTML = `
      <div class="hud-header" id="hudDragHandle">
        <div class="hud-brand">
          <div class="hud-spark">
            <svg viewBox="0 0 24 24"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>
          </div>
          <span>Đáp án AI</span>
        </div>
        <div class="hud-actions">
          <span class="timer-badge" id="hudTimerBadge">⏳ 3s</span>
          <button class="hud-btn-icon" id="btnMinimize" title="Thu nhỏ">
            <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>
          <button class="hud-btn-icon" id="btnClose" title="Đóng (Esc)">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
          </button>
        </div>
      </div>

      <div class="hud-body" id="hudBody">
        <!-- Minimal answer content injected here -->
      </div>

      <div class="hud-progress-track">
        <div class="hud-progress-bar" id="hudProgressBar"></div>
      </div>
    `;

    shadowRoot.appendChild(hudElement);

    setupEventListeners();
  }

  function setupEventListeners() {
    const handle = shadowRoot.getElementById('hudDragHandle');
    const btnClose = shadowRoot.getElementById('btnClose');
    const btnMinimize = shadowRoot.getElementById('btnMinimize');

    // Dragging
    handle.addEventListener('mousedown', onDragStart);

    // Close button
    btnClose.addEventListener('click', () => {
      clearAutoDismiss();
      hideHUD();
    });

    // Minimize toggle
    btnMinimize.addEventListener('click', () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        hudElement.classList.add('minimized');
      } else {
        hudElement.classList.remove('minimized');
      }
    });

    // Hover detection for 3-second Auto-Dismiss
    hudElement.addEventListener('mouseenter', () => {
      isHovered = true;
      if (isResultActive) {
        pauseAutoDismiss();
      }
    });

    hudElement.addEventListener('mouseleave', () => {
      isHovered = false;
      if (isResultActive) {
        startAutoDismiss(DISMISS_DURATION_MS);
      }
    });

    // Delegate mini copy buttons
    shadowRoot.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.btn-mini-copy');
      if (copyBtn) {
        const text = copyBtn.getAttribute('data-copy');
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Đã chép';
            setTimeout(() => {
              copyBtn.innerHTML = originalText;
            }, 1200);
          });
        }
      }
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hudElement && !hudElement.classList.contains('hidden')) {
        clearAutoDismiss();
        hideHUD();
      }
    });
  }

  // Auto-Dismiss Timer Logic
  function startAutoDismiss(durationMs = 3000) {
    clearAutoDismiss();
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    const timerBadge = shadowRoot.getElementById('hudTimerBadge');
    const progressBar = shadowRoot.getElementById('hudProgressBar');

    if (timerBadge) {
      timerBadge.classList.remove('paused');
      timerBadge.style.display = 'inline-flex';
      timerBadge.textContent = `⏳ ${Math.ceil(durationMs / 1000)}s`;
    }

    progressInterval = setInterval(() => {
      const remainingMs = Math.max(0, endTime - Date.now());
      const percent = (remainingMs / DISMISS_DURATION_MS) * 100;

      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      if (timerBadge) {
        timerBadge.textContent = `⏳ ${Math.ceil(remainingMs / 1000)}s`;
      }

      if (remainingMs <= 0) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }, 50);

    dismissTimeout = setTimeout(() => {
      hideHUD();
    }, durationMs);
  }

  function pauseAutoDismiss() {
    clearAutoDismiss();
    const timerBadge = shadowRoot.getElementById('hudTimerBadge');
    const progressBar = shadowRoot.getElementById('hudProgressBar');

    if (timerBadge) {
      timerBadge.classList.add('paused');
      timerBadge.textContent = '⏸ Giữ chuột';
    }
    if (progressBar) {
      progressBar.style.width = '100%';
    }
  }

  function clearAutoDismiss() {
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
    }
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function hideHUD() {
    if (!hudElement) return;
    isResultActive = false;
    hudElement.classList.add('fade-out');
    setTimeout(() => {
      hudElement.classList.add('hidden');
      hudElement.classList.remove('fade-out');
    }, 200);
  }

  function onDragStart(e) {
    if (e.target.closest('.hud-btn-icon')) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = hudElement.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    hudElement.style.right = 'auto';
    hudElement.style.bottom = 'auto';
    hudElement.style.left = `${initialLeft}px`;
    hudElement.style.top = `${initialTop}px`;

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;

    const maxLeft = window.innerWidth - hudElement.offsetWidth - 10;
    const maxTop = window.innerHeight - hudElement.offsetHeight - 10;

    newLeft = Math.max(10, Math.min(newLeft, maxLeft));
    newTop = Math.max(10, Math.min(newTop, maxTop));

    hudElement.style.left = `${newLeft}px`;
    hudElement.style.top = `${newTop}px`;
  }

  function onDragEnd() {
    isDragging = false;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  // Display Status (Capturing / Analyzing)
  function showStatus(text) {
    getOrCreateHUD();
    clearAutoDismiss();
    isResultActive = false;

    hudElement.classList.remove('hidden');
    hudElement.classList.remove('fade-out');
    if (isMinimized) {
      isMinimized = false;
      hudElement.classList.remove('minimized');
    }

    const timerBadge = shadowRoot.getElementById('hudTimerBadge');
    if (timerBadge) timerBadge.style.display = 'none';

    const progressBar = shadowRoot.getElementById('hudProgressBar');
    if (progressBar) progressBar.style.width = '100%';

    const body = shadowRoot.getElementById('hudBody');
    body.innerHTML = `
      <div class="status-box">
        <div class="mini-spinner"></div>
        <div class="status-text">${escapeHTML(text)}</div>
      </div>
    `;
  }

  // Display Minimal Answers Only (Super clean & fast)
  function showResult(data) {
    getOrCreateHUD();
    hudElement.classList.remove('hidden');
    hudElement.classList.remove('fade-out');

    const body = shadowRoot.getElementById('hudBody');
    const items = Array.isArray(data.items) ? data.items : [];
    const skipped = Array.isArray(data.skipped_questions) ? data.skipped_questions : [];

    if (items.length === 0 && skipped.length === 0) {
      body.innerHTML = `
        <div class="empty-notice">
          🔍 Không phát hiện câu hỏi nào trên màn hình.
        </div>
      `;
    } else if (items.length === 0 && skipped.length > 0) {
      body.innerHTML = `
        <div class="skipped-hint">
          ⚠️ Không đủ phương án: ${escapeHTML(skipped.map(s => s.question_number || s).join(', '))}
        </div>
      `;
    } else {
      function parseAnswerDisplay(raw) {
        if (!raw) return { letter: '', desc: '' };
        const trimmed = String(raw).trim();
        const match = trimmed.match(/^(?:(?:Đáp án|Phương án|Option)\s*[:.]\s*)?\(?([A-D])\)?(?:\s*[:.\-–]\s*(.*))?$/i);
        if (match) {
          return {
            letter: match[1].toUpperCase(),
            desc: (match[2] || '').trim()
          };
        }
        const firstLetterMatch = trimmed.match(/^([A-D])\b(?:\s*(.*))?/i);
        if (firstLetterMatch) {
          return {
            letter: firstLetterMatch[1].toUpperCase(),
            desc: (firstLetterMatch[2] || '').trim()
          };
        }
        return { letter: '', desc: trimmed };
      }

      // Render answers with prioritized large letter A, B, C, D
      const answersHTML = items.map((item, idx) => {
        const qTag = item.question_number || `Câu ${idx + 1}`;
        const ansText = item.correct_answer || item.correct_key || 'Không xác định';
        const copyPayload = `${qTag}: ${ansText}`;
        const ansInfo = parseAnswerDisplay(ansText);

        let ansDisplayHTML = '';
        if (ansInfo.letter) {
          ansDisplayHTML = `
            <span class="ans-letter-box">
              <span class="ans-letter">${escapeHTML(ansInfo.letter)}</span>
            </span>
            ${ansInfo.desc ? `<span class="ans-desc">${escapeHTML(ansInfo.desc)}</span>` : ''}
          `;
        } else {
          ansDisplayHTML = `<span class="ans-highlight">${escapeHTML(ansText)}</span>`;
        }

        let auditBadgeHTML = '';
        if (item.is_corrected) {
          auditBadgeHTML = `<span class="badge-audit badge-corrected" title="${escapeHTML(item.audit_note || 'Đã sửa đáp án từ phương án tương tự')}">⚡ Đã đính chính</span>`;
        } else if (item.is_verified) {
          auditBadgeHTML = `<span class="badge-audit badge-verified" title="${escapeHTML(item.audit_note || 'Đã kiểm tra chéo chuẩn xác')}">✓ Đã kiểm tra chéo</span>`;
        }

        const noteText = item.audit_note || item.analysis || '';
        const analysisHTML = (noteText && noteText.trim().length > 3)
          ? `<div class="ans-analysis" title="${escapeHTML(noteText)}">💡 ${escapeHTML(noteText)}</div>`
          : '';

        return `
          <div class="ans-row">
            <div class="ans-content">
              <div class="ans-main">
                <span class="q-tag">${escapeHTML(qTag)}</span>
                ${ansDisplayHTML}
                ${auditBadgeHTML}
              </div>
              ${analysisHTML}
            </div>
            <button class="btn-mini-copy" data-copy="${escapeHTML(copyPayload)}" title="Sao chép câu này">📋</button>
          </div>
        `;
      }).join('');

      let skippedNoticeHTML = '';
      if (skipped.length > 0) {
        skippedNoticeHTML = `
          <div class="skipped-hint">
            ⚠️ Bỏ qua: ${escapeHTML(skipped.map(s => `${s.question_number || s} (thiếu đáp án)`).join('; '))}
          </div>
        `;
      }

      body.innerHTML = `
        <div class="ans-list">
          ${answersHTML}
          ${skippedNoticeHTML}
        </div>
      `;
    }

    // Activate 3-Second Auto-Dismiss
    isResultActive = true;
    if (isHovered) {
      pauseAutoDismiss();
    } else {
      startAutoDismiss(DISMISS_DURATION_MS);
    }
  }

  // Display Error
  function showError(message) {
    getOrCreateHUD();
    clearAutoDismiss();
    isResultActive = false;

    hudElement.classList.remove('hidden');
    hudElement.classList.remove('fade-out');

    const timerBadge = shadowRoot.getElementById('hudTimerBadge');
    if (timerBadge) timerBadge.style.display = 'none';

    const body = shadowRoot.getElementById('hudBody');
    body.innerHTML = `
      <div class="error-box">
        ⚠️ ${escapeHTML(message)}
      </div>
    `;

    // Auto dismiss error after 6 seconds
    startAutoDismiss(6000);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Message listener from background worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
      sendResponse({ status: 'PONG' });
      return;
    }

    if (request.action === 'HIDE_FOR_CAPTURE') {
      if (hudElement) {
        hudElement.classList.add('hidden');
      }
      sendResponse({ status: 'hidden' });
      return;
    }

    if (request.action === 'SHOW_STATUS') {
      showStatus(request.text || 'Đang xử lý...');
    } else if (request.action === 'SHOW_RESULT') {
      showResult(request.data);
    } else if (request.action === 'SHOW_ERROR') {
      showError(request.message);
    }
  });

  // Robust Global Shortcut Handler (Capture phase, supports Alt+R and Alt+Z fallback)
  function handleGlobalShortcut(e) {
    if (!e.altKey) return;

    const isR = e.code === 'KeyR' || e.key === 'r' || e.key === 'R';
    const isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z';

    if (isR || isZ) {
      e.preventDefault();
      e.stopPropagation();
      try {
        chrome.runtime.sendMessage({ action: 'TRIGGER_CAPTURE' });
      } catch (err) {
        console.warn('Extension vừa reload, vui lòng nhấn F5 lại tab này!');
      }
    }
  }

  window.addEventListener('keydown', handleGlobalShortcut, true);
  document.addEventListener('keydown', handleGlobalShortcut, true);
})();
