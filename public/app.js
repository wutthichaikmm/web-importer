import {
  buildExportText,
  formatExportFilename,
  runWithConcurrency,
} from "./app-core.js";

const dom = {
  tocForm: document.querySelector("#toc-form"),
  tocUrl: document.querySelector("#toc-url"),
  fetchTocButton: document.querySelector("#fetch-toc-button"),
  startNumber: document.querySelector("#start-number"),
  selectionStartNumber: document.querySelector("#selection-start-number"),
  selectionStep: document.querySelector("#selection-step"),
  chapterList: document.querySelector("#chapter-list"),
  selectedCount: document.querySelector("#selected-count"),
  selectAllButton: document.querySelector("#select-all-button"),
  reverseOrderButton: document.querySelector("#reverse-order-button"),
  delayMs: document.querySelector("#delay-ms"),
  concurrency: document.querySelector("#concurrency"),
  startFetchButton: document.querySelector("#start-fetch-button"),
  fetchStep: document.querySelector("#fetch-step"),
  fetchStateLabel: document.querySelector("#fetch-state-label"),
  progressLabel: document.querySelector("#progress-label"),
  progressBar: document.querySelector("#progress-bar"),
  progressFill: document.querySelector(".progress-fill"),
  progressPercent: document.querySelector("#progress-percent"),
  progressList: document.querySelector("#progress-list"),
  fetchSummary: document.querySelector("#fetch-summary"),
  exportButton: document.querySelector("#export-button"),
  resetButton: document.querySelector("#reset-button"),
  connectionState: document.querySelector("#toc-status"),
  inputMessage: document.querySelector("#input-message"),
  inputMessageBottom: document.querySelector("#input-message-bottom"),
  liveRegion: document.querySelector("#live-region"),
};

const state = {
  step: "input",
  tocUrl: "",
  chapters: [],
  fetchingItems: [],
  lastClickedIndex: null,
  isBusy: false,
};

function announce(message) {
  dom.liveRegion.textContent = "";
  window.setTimeout(() => {
    dom.liveRegion.textContent = message;
  }, 0);
}

function setMessage(message = "") {
  dom.inputMessage.textContent = message;
  dom.inputMessageBottom.textContent = message;
}

function setConnectionState(message, connected = false) {
  const text = dom.connectionState.querySelector("span:last-child");
  if (text) text.textContent = `FlareSolverr: ${message}`;
  dom.connectionState.classList.toggle("is-connected", connected);
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
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

function selectedChapterCount() {
  return state.chapters.filter((chapter) => chapter.selected).length;
}

function updateSelectionSummary() {
  const selected = selectedChapterCount();
  dom.selectedCount.textContent = String(selected);
  dom.startFetchButton.disabled = selected === 0 || state.isBusy;
  dom.selectAllButton.textContent =
    selected === state.chapters.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด";
}

function createChapterRow(chapter) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `chapter-row${chapter.selected ? " is-selected" : ""}`;
  row.dataset.index = String(chapter.idx);
  row.setAttribute("role", "listitem");

  const number = document.createElement("span");
  number.className = "chapter-number";
  number.textContent = `${chapter.selected ? "✓ " : "○ "}#${chapter.chapterNumber}`;

  const details = document.createElement("span");
  const title = document.createElement("span");
  title.className = "chapter-title";
  title.textContent = chapter.title;
  const source = document.createElement("span");
  source.className = "chapter-source";
  source.textContent = chapter.url;
  details.append(title, source);

  const status = document.createElement("span");
  status.className = "row-state";
  status.textContent = "พร้อมดึง";

  row.append(number, details, status);
  row.addEventListener("click", (event) => {
    const clickedIndex = chapter.idx;
    if (event.shiftKey && state.lastClickedIndex !== null) {
      const from = Math.min(state.lastClickedIndex, clickedIndex);
      const to = Math.max(state.lastClickedIndex, clickedIndex);
      const targetSelected = !state.chapters.find(
        (item) => item.idx === clickedIndex,
      ).selected;
      state.chapters.forEach((item) => {
        if (item.idx >= from && item.idx <= to) item.selected = targetSelected;
      });
    } else {
      chapter.selected = !chapter.selected;
    }
    state.lastClickedIndex = clickedIndex;
    renderChapterList();
    updateSelectionSummary();
  });

  return row;
}

function renderChapterList() {
  dom.chapterList.replaceChildren();
  if (state.chapters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "ยังไม่มีรายการ chapter";
    dom.chapterList.append(empty);
    return;
  }

  state.chapters.forEach((chapter) => {
    dom.chapterList.append(createChapterRow(chapter));
  });
}

function setSelectionStart(value) {
  const start = Math.max(1, Number(value) || 1);
  dom.startNumber.value = String(start);
  dom.selectionStartNumber.value = String(start);
  state.chapters.forEach((chapter, index) => {
    chapter.chapterNumber = start + index;
  });
  renderChapterList();
}

function setSelectionCount(count) {
  state.chapters.forEach((chapter, index) => {
    chapter.selected = index < count;
  });
  renderChapterList();
  updateSelectionSummary();
}

function renderProgress() {
  dom.progressList.replaceChildren();
  state.fetchingItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "progress-row";
    row.setAttribute("role", "listitem");

    const number = document.createElement("span");
    number.className = "progress-number";
    number.textContent = `#${item.chapterNumber}`;

    const title = document.createElement("span");
    title.className = "progress-title";
    title.textContent = item.title;

    const status = document.createElement("span");
    status.className = "progress-state";
    const statusText = {
      queued: "รอคิว",
      fetching: "กำลังดึง",
      done: "สำเร็จ",
      error: item.error || "ล้มเหลว",
    }[item.status];
    status.textContent = statusText;
    if (item.status === "done") status.classList.add("is-done");
    if (item.status === "error") status.classList.add("is-error");

    row.append(number, title, status);
    dom.progressList.append(row);
  });
}

function updateProgress(done, total) {
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  dom.progressLabel.textContent = `${done} / ${total} chapter`;
  dom.progressPercent.textContent = `${percentage}%`;
  dom.progressBar.setAttribute("aria-valuenow", String(percentage));
  dom.progressFill.style.width = `${percentage}%`;
}

async function fetchSelectedChapters() {
  const selected = state.chapters
    .filter((chapter) => chapter.selected)
    .map((chapter) => ({ ...chapter, status: "queued", content: "" }));
  if (selected.length === 0) return;

  state.isBusy = true;
  state.step = "fetching";
  state.fetchingItems = selected;
  dom.selectionStep.hidden = true;
  dom.fetchStep.hidden = false;
  dom.exportButton.disabled = true;
  dom.fetchStateLabel.textContent = "FETCHING";
  dom.fetchSummary.textContent = "กำลังติดต่อ FlareSolverr";
  updateProgress(0, selected.length);
  renderProgress();
  announce(`เริ่มดึง ${selected.length} chapter`);

  let done = 0;
  try {
    await runWithConcurrency(
      selected,
      numberValue(dom.concurrency, 4, 1, 12),
      async (item) => {
        item.status = "fetching";
        renderProgress();

        try {
          const result = await postJson("/api/chapter", { url: item.url });
          item.status = "done";
          item.content = result.content;
        } catch (error) {
          item.status = "error";
          item.error = error instanceof Error ? error.message : "ดึงไม่สำเร็จ";
        }

        done += 1;
        updateProgress(done, selected.length);
        renderProgress();
      },
      numberValue(dom.delayMs, 100, 0),
    );
  } finally {
    state.isBusy = false;
  }

  const successful = state.fetchingItems.filter((item) => item.status === "done");
  const failed = state.fetchingItems.length - successful.length;
  state.step = "done";
  dom.fetchStateLabel.textContent = "DONE";
  dom.fetchSummary.textContent =
    failed > 0
      ? `สำเร็จ ${successful.length} / ${selected.length} · ล้มเหลว ${failed}`
      : `สำเร็จครบ ${successful.length} chapter`;
  dom.exportButton.disabled = successful.length === 0;
  setConnectionState("เชื่อมต่อแล้ว", true);
  announce(
    failed > 0
      ? `ดึงเสร็จแล้ว สำเร็จ ${successful.length} ตอน ล้มเหลว ${failed} ตอน`
      : `ดึงเสร็จแล้ว ${successful.length} ตอน`,
  );
}

function downloadExport() {
  const successful = state.fetchingItems.filter((item) => item.status === "done");
  if (successful.length === 0) {
    announce("ไม่มี chapter ที่สำเร็จให้ดาวน์โหลด");
    return;
  }

  const text = buildExportText(successful);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = formatExportFilename(new Date());
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  announce(`ดาวน์โหลด ${successful.length} chapter แล้ว`);
}

function resetApp() {
  state.step = "input";
  state.tocUrl = "";
  state.chapters = [];
  state.fetchingItems = [];
  state.lastClickedIndex = null;
  state.isBusy = false;
  dom.tocUrl.value = "";
  dom.startNumber.value = "1";
  dom.selectionStartNumber.value = "1";
  dom.delayMs.value = "100";
  dom.concurrency.value = "4";
  dom.selectionStep.hidden = true;
  dom.fetchStep.hidden = true;
  dom.exportButton.disabled = true;
  dom.fetchStateLabel.textContent = "FETCHING";
  setMessage("");
  setConnectionState("รอการเชื่อมต่อ");
  renderChapterList();
  updateSelectionSummary();
  updateProgress(0, 0);
  announce("เริ่มงานใหม่แล้ว");
  dom.tocUrl.focus();
}

dom.tocForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.isBusy) return;

  const url = dom.tocUrl.value.trim();
  if (!url) return;

  state.isBusy = true;
  dom.fetchTocButton.disabled = true;
  setMessage("");
  setConnectionState("กำลังดึงสารบัญ...");
  announce("กำลังติดต่อ FlareSolverr");

  try {
    const data = await postJson("/api/toc", { url });
    if (!Array.isArray(data.chapters) || data.chapters.length === 0) {
      throw new Error("ไม่พบรายการ chapter ในหน้านี้");
    }

    const start = numberValue(dom.startNumber, 1, 1);
    state.tocUrl = url;
    state.chapters = data.chapters.map((chapter, index) => ({
      idx: index,
      title: String(chapter.title ?? ""),
      url: String(chapter.url ?? ""),
      selected: true,
      chapterNumber: start + index,
      status: "pending",
    }));
    state.step = "select";
    state.lastClickedIndex = null;
    dom.selectionStartNumber.value = String(start);
    dom.selectionStep.hidden = false;
    dom.fetchStep.hidden = true;
    renderChapterList();
    updateSelectionSummary();
    setConnectionState("เชื่อมต่อแล้ว", true);
    announce(`พบ ${state.chapters.length} chapter`);
    dom.selectionStep.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดึงสารบัญไม่สำเร็จ";
    setMessage(message);
    setConnectionState("เกิดข้อผิดพลาด");
    announce(message);
  } finally {
    state.isBusy = false;
    dom.fetchTocButton.disabled = false;
  }
});

dom.startNumber.addEventListener("input", () => {
  if (!state.chapters.length || state.isBusy) return;
  setSelectionStart(numberValue(dom.startNumber, 1, 1));
});

dom.selectionStartNumber.addEventListener("input", () => {
  if (!state.chapters.length || state.isBusy) return;
  setSelectionStart(numberValue(dom.selectionStartNumber, 1, 1));
});

dom.selectAllButton.addEventListener("click", () => {
  if (state.isBusy) return;
  const shouldSelect = selectedChapterCount() !== state.chapters.length;
  state.chapters.forEach((chapter) => {
    chapter.selected = shouldSelect;
  });
  renderChapterList();
  updateSelectionSummary();
});

dom.reverseOrderButton.addEventListener("click", () => {
  if (state.isBusy) return;
  state.chapters.reverse();
  state.chapters.forEach((chapter, index) => {
    chapter.chapterNumber = numberValue(dom.selectionStartNumber, 1, 1) + index;
  });
  renderChapterList();
  announce("สลับลำดับ chapter แล้ว");
});

document.querySelectorAll("[data-select-count]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.isBusy) return;
    setSelectionCount(
      Math.min(Number(button.dataset.selectCount), state.chapters.length),
    );
  });
});

dom.startFetchButton.addEventListener("click", fetchSelectedChapters);
dom.exportButton.addEventListener("click", downloadExport);
dom.resetButton.addEventListener("click", resetApp);

renderChapterList();
updateSelectionSummary();


