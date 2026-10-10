import {
  buildExportText,
  chaptersToRetry,
  chaptersToStart,
  exportableChapters,
  formatExportFilename,
  importerControls,
  isActiveRequest,
  runProgress,
  runWithConcurrency,
  selectChapterRange,
} from "./app-core.js";

const STATUS_TEXT = {
  idle: "",
  queued: "รอคิว",
  fetching: "กำลังดึง",
  done: "สำเร็จ",
  stopped: "หยุดแล้ว",
};

const dom = {};

const state = {
  chapters: [],
  tocLoading: false,
  running: false,
  stopping: false,
  runIds: new Set(),
  tocController: null,
  runController: null,
  lastClickedIdx: null,
  shiftHeld: false,
  stopHadFocus: false,
  rows: new Map(),
  renderedLocked: null,
};

function announce(message) {
  dom.liveRegion.textContent = "";
  window.setTimeout(() => {
    dom.liveRegion.textContent = message;
  }, 0);
}

function setMessage(message = "") {
  dom.message.textContent = message;
}

function setFlareStatus(name, text) {
  dom.flareStatus.dataset.state = name;
  dom.flareStatusText.textContent = `FlareSolverr: ${text}`;
}

async function postJson(path, payload, { signal } = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data.error || `คำขอล้มเหลว (${response.status})`);
  }

  return data;
}

function numberValue(input, fallback, minimum, maximum = Number.POSITIVE_INFINITY) {
  const value = Number.parseInt(input.value, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function isLocked() {
  return state.tocLoading || state.running;
}

function confirmDiscard(buildMessage) {
  const done = state.chapters.filter((chapter) => chapter.status === "done").length;
  return done === 0 || window.confirm(buildMessage(done));
}

function runChapters() {
  return state.chapters.filter((chapter) => state.runIds.has(chapter.idx));
}

function applyNumbering() {
  const start = numberValue(dom.startNumber, 1, 1);
  state.chapters.forEach((chapter, index) => {
    chapter.chapterNumber = start + index;
  });
}

// Rows

function createRow(chapter) {
  const row = document.createElement("li");
  row.className = "chapter-row";
  row.dataset.idx = String(chapter.idx);

  const label = document.createElement("label");
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "chapter-check";

  const number = document.createElement("span");
  number.className = "chapter-number";

  const text = document.createElement("span");
  text.className = "chapter-text";
  const title = document.createElement("span");
  title.className = "chapter-title";
  title.textContent = chapter.title;
  title.title = chapter.title;
  const url = document.createElement("span");
  url.className = "chapter-url";
  url.textContent = chapter.url;
  text.append(title, url);

  const chip = document.createElement("span");
  chip.className = "status-chip";
  const chipText = document.createElement("span");
  chipText.className = "status-chip-text";
  chip.append(chipText);

  label.append(check, number, text, chip);
  row.append(label);
  state.rows.set(chapter.idx, { row, check, number, chip, chipText });
  updateRow(chapter);
  return row;
}

function updateRow(chapter) {
  const refs = state.rows.get(chapter.idx);
  if (!refs) return;

  const statusText =
    chapter.status === "error" ? chapter.error || "ล้มเหลว" : STATUS_TEXT[chapter.status];
  refs.row.dataset.status = chapter.status;
  refs.row.classList.toggle("is-selected", chapter.selected);
  refs.check.checked = chapter.selected;
  refs.number.textContent = `#${chapter.chapterNumber}`;
  refs.chipText.textContent = statusText;
  refs.chip.title = chapter.status === "error" ? statusText : "";
}

function refreshRows() {
  state.chapters.forEach(updateRow);
}

function renderList() {
  state.rows.clear();
  state.renderedLocked = null;
  dom.list.replaceChildren(...state.chapters.map(createRow));

  const empty = state.chapters.length === 0;
  dom.list.hidden = empty;
  dom.empty.hidden = !empty;
}

// Panel

function renderControls() {
  const controls = importerControls(state);
  const noChapters = controls.total === 0;

  dom.selectedCount.textContent = String(controls.selected);
  dom.totalCount.textContent = String(controls.total);

  dom.startButton.hidden = !controls.start.visible;
  dom.startButton.disabled = controls.start.disabled;
  dom.startButton.textContent = `เริ่มดึง ${controls.start.count} ตอน`;
  dom.stopButton.hidden = !controls.stop.visible;
  dom.stopButton.disabled = controls.stop.disabled;
  dom.retryButton.hidden = !controls.retry.visible;
  dom.retryButton.disabled = controls.retry.disabled;
  dom.retryButton.textContent = `ลองดึงตอนที่ไม่สำเร็จ (${controls.retry.count})`;
  dom.exportButton.disabled = controls.download.disabled;
  dom.exportButton.textContent = `ดาวน์โหลด .txt (${controls.download.count} ตอน)`;

  dom.fetchTocButton.disabled = controls.locked;
  [dom.delayMs, dom.concurrency].forEach((input) => {
    input.disabled = controls.locked;
  });
  [
    dom.selectAllButton,
    dom.rangeFrom,
    dom.rangeTo,
    dom.selectRangeButton,
    dom.reverseButton,
  ].forEach((control) => {
    control.disabled = controls.locked || noChapters;
  });
  dom.startNumber.disabled = controls.numbering.disabled;
  dom.selectAllButton.textContent =
    !noChapters && controls.selected === controls.total ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด";

  if (state.renderedLocked !== controls.locked) {
    state.renderedLocked = controls.locked;
    dom.listPanel.classList.toggle("is-locked", controls.locked);
    state.rows.forEach(({ check }) => {
      check.disabled = controls.locked;
    });
  }
}

function renderProgress() {
  const progress = runProgress(runChapters());
  const percent = progress.total > 0 ? Math.round((progress.finished / progress.total) * 100) : 0;

  dom.progressSection.hidden = progress.total === 0;
  dom.progressLabel.textContent = `${progress.finished} / ${progress.total} ตอน`;
  dom.progressPercent.textContent = `${percent}%`;
  dom.progressBar.setAttribute("aria-valuenow", String(percent));
  dom.progressFill.style.width = `${percent}%`;
  dom.progressCounts.textContent =
    `สำเร็จ ${progress.done} · ล้มเหลว ${progress.error} · ` +
    `หยุด ${progress.stopped} · เหลือ ${progress.remaining}`;
  dom.tabBadge.hidden = !state.running;
  dom.tabBadge.textContent = `${progress.finished}/${progress.total}`;
}

function render() {
  renderControls();
  renderProgress();
}

// TOC

async function loadToc(event) {
  event.preventDefault();
  if (isLocked()) return;

  const url = dom.tocUrl.value.trim();
  if (!url) return;
  if (
    !confirmDiscard(
      (done) =>
        `มี ${done} ตอนที่ดึงสำเร็จแล้ว การดึงสารบัญใหม่จะล้างรายการเดิม ต้องการดำเนินการต่อหรือไม่?`,
    )
  ) {
    return;
  }

  const controller = new AbortController();
  state.tocLoading = true;
  state.tocController = controller;
  setMessage("");
  setFlareStatus("connecting", "กำลังดึงสารบัญ...");
  announce("กำลังติดต่อ FlareSolverr");
  renderControls();

  try {
    const data = await postJson("/api/toc", { url }, { signal: controller.signal });
    if (!isActiveRequest(state.tocController, controller)) return;
    if (!Array.isArray(data.chapters) || data.chapters.length === 0) {
      throw new Error("ไม่พบรายการ chapter ในหน้านี้");
    }

    const start = numberValue(dom.startNumber, 1, 1);
    state.chapters = data.chapters.map((chapter, index) => ({
      idx: index,
      title: String(chapter.title ?? ""),
      url: String(chapter.url ?? ""),
      chapterNumber: start + index,
      selected: true,
      status: "idle",
      content: "",
      error: "",
    }));
    state.runIds = new Set();
    state.lastClickedIdx = null;
    dom.fetchSummary.textContent = "";
    renderList();
    setFlareStatus("connected", "เชื่อมต่อแล้ว");
    announce(`พบ ${state.chapters.length} ตอน`);
  } catch (error) {
    if (!isActiveRequest(state.tocController, controller)) return;
    const message = error instanceof Error ? error.message : "ดึงสารบัญไม่สำเร็จ";
    setMessage(message);
    setFlareStatus("error", "เกิดข้อผิดพลาด");
    announce(message);
  } finally {
    if (state.tocController === controller) {
      state.tocController = null;
      state.tocLoading = false;
    }
    render();
  }
}

// Selection

function toggleChapter(idx, checked, shiftKey) {
  const position = state.chapters.findIndex((chapter) => chapter.idx === idx);
  const lastPosition = state.chapters.findIndex(
    (chapter) => chapter.idx === state.lastClickedIdx,
  );

  if (shiftKey && lastPosition !== -1) {
    const from = Math.min(position, lastPosition);
    const to = Math.max(position, lastPosition);
    state.chapters.slice(from, to + 1).forEach((chapter) => {
      chapter.selected = checked;
    });
  } else {
    state.chapters[position].selected = checked;
  }

  state.lastClickedIdx = idx;
  refreshRows();
  renderControls();
}

function handleListChange(event) {
  if (!event.target.matches(".chapter-check")) return;
  const idx = Number(event.target.closest(".chapter-row").dataset.idx);
  const shiftKey = state.shiftHeld;
  state.shiftHeld = false;
  if (isLocked()) return;
  toggleChapter(idx, event.target.checked, shiftKey);
}

function rememberShift(event) {
  state.shiftHeld = event.shiftKey;
}

function toggleSelectAll() {
  if (isLocked()) return;
  const shouldSelect = state.chapters.some((chapter) => !chapter.selected);
  state.chapters.forEach((chapter) => {
    chapter.selected = shouldSelect;
  });
  refreshRows();
  renderControls();
}

function scrollToFirstSelected() {
  const first = state.chapters.find((chapter) => chapter.selected);
  const row = first && state.rows.get(first.idx)?.row;
  if (!row) return;
  dom.list.scrollTop += row.getBoundingClientRect().top - dom.list.getBoundingClientRect().top;
}

function selectRange(event) {
  event.preventDefault();
  if (isLocked() || state.chapters.length === 0) return;

  try {
    state.chapters = selectChapterRange(
      state.chapters,
      dom.rangeFrom.value,
      dom.rangeTo.value,
    );
    setMessage("");
    refreshRows();
    renderControls();
    scrollToFirstSelected();
    announce(`เลือก ${importerControls(state).selected} ตอนแล้ว`);
  } catch (error) {
    setMessage(error.message);
    announce(error.message);
  }
}

function handleStartNumberInput() {
  if (isLocked() || state.chapters.length === 0) return;
  applyNumbering();
  refreshRows();
}

function reverseOrder() {
  if (isLocked()) return;
  state.chapters.reverse();
  applyNumbering();
  renderList();
  renderControls();
  announce("สลับลำดับตอนแล้ว");
}

// Fetching

function summarizeRun() {
  const { total, done, error, stopped } = runProgress(runChapters());
  if (stopped > 0) {
    dom.fetchSummary.textContent = `หยุดแล้ว · สำเร็จ ${done} / ${total} ตอน`;
    announce(`หยุดแล้ว เก็บผลสำเร็จ ${done} ตอน`);
  } else if (error > 0) {
    dom.fetchSummary.textContent = `สำเร็จ ${done} / ${total} · ล้มเหลว ${error}`;
    announce(`ดึงเสร็จแล้ว สำเร็จ ${done} ตอน ล้มเหลว ${error} ตอน`);
  } else {
    dom.fetchSummary.textContent = `สำเร็จครบ ${done} ตอน`;
    announce(`ดึงเสร็จแล้ว ${done} ตอน`);
  }

  if (done > 0) setFlareStatus("connected", "เชื่อมต่อแล้ว");
  else if (error > 0) setFlareStatus("error", "เกิดข้อผิดพลาด");
}

async function runFetch(chapters) {
  if (isLocked() || chapters.length === 0) return;

  const controller = new AbortController();
  const isCurrent = () => isActiveRequest(state.runController, controller);

  chapters.forEach((chapter) => {
    chapter.status = "queued";
    chapter.error = "";
    updateRow(chapter);
  });
  state.running = true;
  state.stopping = false;
  state.runController = controller;
  state.runIds = new Set(chapters.map((chapter) => chapter.idx));
  const focusStop = [dom.startButton, dom.retryButton].includes(document.activeElement);
  setMessage("");
  dom.fetchSummary.textContent = "";
  render();
  if (focusStop) dom.stopButton.focus();
  announce(`เริ่มดึง ${chapters.length} ตอน`);

  try {
    await runWithConcurrency(
      chapters,
      numberValue(dom.concurrency, 4, 1, 12),
      async (chapter) => {
        if (!isCurrent()) return;
        chapter.status = "fetching";
        updateRow(chapter);
        renderProgress();

        try {
          const result = await postJson(
            "/api/chapter",
            { url: chapter.url },
            { signal: controller.signal },
          );
          if (!isCurrent()) return;
          chapter.status = "done";
          chapter.content = result.content;
        } catch (error) {
          if (!isCurrent()) return;
          chapter.status = "error";
          chapter.error = error instanceof Error ? error.message : "ดึงไม่สำเร็จ";
        }

        updateRow(chapter);
        render();
      },
      numberValue(dom.delayMs, 100, 0),
      { signal: controller.signal },
    );
  } finally {
    let restoreFocus = false;
    if (state.runController === controller) {
      runChapters().forEach((chapter) => {
        if (chapter.status === "queued" || chapter.status === "fetching") {
          chapter.status = "stopped";
          updateRow(chapter);
        }
      });
      restoreFocus = state.stopHadFocus || document.activeElement === dom.stopButton;
      state.running = false;
      state.stopping = false;
      state.stopHadFocus = false;
      state.runController = null;
      summarizeRun();
    }
    render();
    if (restoreFocus) {
      [dom.retryButton, dom.startButton, dom.exportButton]
        .find((button) => !button.hidden && !button.disabled)
        ?.focus();
    }
  }
}

function startFetch() {
  runFetch(chaptersToStart(state.chapters));
}

function retryFailed() {
  runFetch(chaptersToRetry(state.chapters));
}

function stopFetch() {
  if (!state.running || !state.runController) return;
  state.stopHadFocus = document.activeElement === dom.stopButton;
  state.runController.abort();
  state.stopping = true;
  dom.fetchSummary.textContent = "กำลังหยุดและเก็บผลที่สำเร็จ";
  renderControls();
  announce("หยุดการดึงแล้ว กำลังเก็บผลที่สำเร็จไว้");
}

// Export and reset

function downloadExport() {
  const chapters = exportableChapters(state.chapters);
  if (chapters.length === 0) {
    announce("ไม่มีตอนที่สำเร็จให้ดาวน์โหลด");
    return;
  }

  const blob = new Blob([buildExportText(chapters)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = formatExportFilename(new Date());
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  announce(`ดาวน์โหลด ${chapters.length} ตอนแล้ว`);
}

function resetImporter() {
  if (!confirmDiscard((done) => `มี ${done} ตอนที่ดึงสำเร็จแล้ว ต้องการล้างทั้งหมดหรือไม่?`)) {
    return;
  }

  state.runController?.abort();
  state.tocController?.abort();
  Object.assign(state, {
    chapters: [],
    tocLoading: false,
    running: false,
    stopping: false,
    runIds: new Set(),
    tocController: null,
    runController: null,
    lastClickedIdx: null,
    stopHadFocus: false,
  });
  dom.rangeFrom.value = "";
  dom.rangeTo.value = "";
  dom.fetchSummary.textContent = "";
  setMessage("");
  setFlareStatus("idle", "รอการเชื่อมต่อ");
  renderList();
  render();
  announce("เริ่มใหม่แล้ว");
  dom.tocUrl.focus();
}

export function initImporter() {
  const $ = (selector) => document.querySelector(selector);
  Object.assign(dom, {
    flareStatus: $("#flare-status"),
    flareStatusText: $("#flare-status-text"),
    tabBadge: $("#importer-tab-badge"),
    tocForm: $("#toc-form"),
    tocUrl: $("#toc-url"),
    fetchTocButton: $("#fetch-toc-button"),
    message: $("#importer-message"),
    listPanel: $(".list-panel"),
    selectAllButton: $("#select-all-button"),
    rangeForm: $("#range-form"),
    rangeFrom: $("#range-from"),
    rangeTo: $("#range-to"),
    selectRangeButton: $("#select-range-button"),
    startNumber: $("#start-number"),
    reverseButton: $("#reverse-order-button"),
    list: $("#chapter-list"),
    empty: $("#chapter-empty"),
    selectedCount: $("#selected-count"),
    totalCount: $("#total-count"),
    delayMs: $("#delay-ms"),
    concurrency: $("#concurrency"),
    progressSection: $("#progress-section"),
    progressBar: $("#progress-bar"),
    progressFill: $("#progress-bar .progress-fill"),
    progressLabel: $("#progress-label"),
    progressPercent: $("#progress-percent"),
    progressCounts: $("#progress-counts"),
    fetchSummary: $("#fetch-summary"),
    startButton: $("#start-fetch-button"),
    stopButton: $("#stop-button"),
    retryButton: $("#retry-button"),
    exportButton: $("#export-button"),
    resetButton: $("#reset-button"),
    liveRegion: $("#live-region"),
  });

  dom.tocForm.addEventListener("submit", loadToc);
  dom.selectAllButton.addEventListener("click", toggleSelectAll);
  dom.rangeForm.addEventListener("submit", selectRange);
  dom.startNumber.addEventListener("input", handleStartNumberInput);
  dom.reverseButton.addEventListener("click", reverseOrder);
  dom.list.addEventListener("pointerdown", rememberShift);
  dom.list.addEventListener("keydown", rememberShift);
  dom.list.addEventListener("change", handleListChange);
  dom.startButton.addEventListener("click", startFetch);
  dom.stopButton.addEventListener("click", stopFetch);
  dom.retryButton.addEventListener("click", retryFailed);
  dom.exportButton.addEventListener("click", downloadExport);
  dom.resetButton.addEventListener("click", resetImporter);
  window.addEventListener("beforeunload", (event) => {
    if (importerControls(state).leaveWarning) event.preventDefault();
  });

  renderList();
  render();
}
