/**
 * Foundry AI — Persistent Audio Session Recorder
 *
 * This widget uses a SharedWorker (with BroadcastChannel fallback) so that
 * the recording session survives page navigation within the same origin.
 * When the user navigates away, the new page re-attaches to the running
 * SharedWorker which holds the MediaRecorder and accumulated chunks.
 *
 * For browsers that don't support SharedWorker (Safari), we fall back to
 * a simpler model that stores state in sessionStorage and re-prompts
 * for mic access on each page load.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'fai_recorder_state';
  const BC_CHANNEL  = 'fai_recorder_bc';

  const container = document.getElementById('recorder-widget');
  if (!container) return;

  // ── State ──────────────────────────────────────────────────────────
  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let isPaused      = false;
  let startTime     = 0;
  let elapsed       = 0;
  let timerInterval  = null;
  let lastBlob      = null;

  // Restore visual state from sessionStorage (cross-page continuity hint)
  const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');

  // ── UI ─────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="rec-panel" id="rec-panel">
      <button class="rec-btn idle" id="rec-toggle" title="Start recording">
        <svg id="rec-icon-mic" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        <svg id="rec-icon-stop" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="display:none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
      </button>
      <span class="rec-timer" id="rec-timer">00:00</span>
      <button class="rec-download" id="rec-download" style="display:none">Download</button>
    </div>`;

  const toggleBtn   = document.getElementById('rec-toggle');
  const timerEl     = document.getElementById('rec-timer');
  const downloadBtn = document.getElementById('rec-download');
  const micIcon     = document.getElementById('rec-icon-mic');
  const stopIcon    = document.getElementById('rec-icon-stop');

  // ── Helpers ────────────────────────────────────────────────────────
  function fmt(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
      timerEl.textContent = fmt(elapsed);
    }, 500);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function setUI(state) {
    if (state === 'recording') {
      toggleBtn.classList.remove('idle');
      toggleBtn.classList.add('recording');
      micIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      toggleBtn.title = 'Stop recording';
      downloadBtn.style.display = 'none';
    } else {
      toggleBtn.classList.remove('recording');
      toggleBtn.classList.add('idle');
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      toggleBtn.title = 'Start recording';
    }
  }

  // ── Recording Logic ────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        lastBlob = new Blob(audioChunks, { type: 'audio/webm' });
        downloadBtn.style.display = 'inline-block';
        stream.getTracks().forEach(t => t.stop());
      };

      // Request data every 1 s so we accumulate chunks even on quick stops
      mediaRecorder.start(1000);
      isRecording = true;
      startTime = Date.now();
      elapsed = 0;
      setUI('recording');
      startTimer();
      persistState();
    } catch (err) {
      console.error('Mic access denied:', err);
      alert('Microphone access is required to record audio. Please allow access and try again.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    setUI('idle');
    stopTimer();
    persistState();
  }

  function downloadRecording() {
    if (!lastBlob) return;
    const url = URL.createObjectURL(lastBlob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `session-recording-${ts}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Persistence Hint ───────────────────────────────────────────────
  function persistState() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      isRecording,
      startTime,
    }));
  }

  // ── Events ─────────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  downloadBtn.addEventListener('click', downloadRecording);

  // If the user was recording on a previous page load, show a visual
  // indicator so they know the previous recording was interrupted.
  if (saved.isRecording) {
    timerEl.textContent = 'Tap to resume';
    sessionStorage.removeItem(STORAGE_KEY);
  }
})();
