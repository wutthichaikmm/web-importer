import {
  decodeTextBuffer,
  extractChapterRange,
  formatNovelText,
  formatPostProcessFilename,
} from "./app-core.js";
import { copyText } from "./clipboard.js";

const COPY_LABEL = "คัดลอกผลลัพธ์";
const COPIED_LABEL_MS = 2000;

const dom = {};
let copiedLabelTimer;

const state = {
  file: null,
  text: "",
  encoding: "",
  processedText: "",
  outputFilename: "",
};

function announce(message) {
  dom.liveRegion.textContent = "";
  window.setTimeout(() => {
    dom.liveRegion.textContent = message;
  }, 0);
}

function setStatus(message, error = false) {
  dom.status.textContent = message;
  dom.status.classList.toggle("is-error", error);
}

function clearResult() {
  state.processedText = "";
  state.outputFilename = "";
  dom.downloadButton.disabled = true;
  dom.copyButton.disabled = true;
  dom.preview.textContent = "ยังไม่มีผลลัพธ์";
}

function clearFile() {
  state.file = null;
  state.text = "";
  state.encoding = "";
  dom.formatButton.disabled = true;
  clearResult();
}

function readSourceFile(file) {
  clearFile();

  const preferredEncoding = dom.encoding.value;
  const encodingLabel = preferredEncoding === "auto" ? "อัตโนมัติ" : preferredEncoding;
  setStatus(`กำลังอ่าน ${file.name} (${encodingLabel})...`);

  const isCurrentRead = () =>
    dom.fileInput.files?.[0] === file && dom.encoding.value === preferredEncoding;

  file
    .arrayBuffer()
    .then((buffer) => {
      if (!isCurrentRead()) return;
      const decoded = decodeTextBuffer(buffer, preferredEncoding);
      state.file = file;
      state.text = decoded.text;
      state.encoding = decoded.encoding;
      dom.formatButton.disabled = false;
      setStatus(`${file.name} · ${file.size.toLocaleString()} bytes · ${decoded.encoding}`);
      announce(`อ่านไฟล์ ${file.name} แล้ว`);
    })
    .catch((error) => {
      if (!isCurrentRead()) return;
      const message = error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ";
      setStatus(message, true);
      announce(message);
    });
}

function selectedTextFile() {
  const file = dom.fileInput.files?.[0] || null;
  if (!file) {
    clearFile();
    setStatus("เลือกไฟล์ .txt เพื่อเริ่มต้น");
    return null;
  }
  if (!/\.txt$/i.test(file.name)) {
    clearFile();
    setStatus("กรุณาเลือกไฟล์นามสกุล .txt", true);
    return null;
  }
  return file;
}

function handleFileOrEncodingChange() {
  const file = selectedTextFile();
  if (file) readSourceFile(file);
}

function processFile() {
  if (!state.file) {
    setStatus("กรุณาเลือกไฟล์ .txt ก่อน", true);
    return;
  }

  const startValue = dom.start.value.trim();
  const endValue = dom.end.value.trim();

  try {
    const extractedText = extractChapterRange(
      formatNovelText(state.text),
      startValue,
      endValue,
    );
    const start = Number(startValue);
    const end = Number(endValue);

    state.processedText = extractedText;
    state.outputFilename = formatPostProcessFilename(start, end);
    dom.preview.textContent =
      extractedText.length > 1200 ? `${extractedText.slice(0, 1200)}\n…` : extractedText;
    dom.downloadButton.disabled = false;
    dom.copyButton.disabled = false;
    setStatus(`จัดรูปแบบแล้ว · ตอน ${start}-${end} · ${state.encoding}`);
    announce(`จัดรูปแบบและตัดตอน ${start}-${end} แล้ว`);
  } catch (error) {
    clearResult();
    const message = error instanceof Error ? error.message : "ประมวลผลไฟล์ไม่สำเร็จ";
    setStatus(message, true);
    announce(message);
  }
}

function handleRangeInput() {
  if (!state.processedText) return;

  clearResult();
  setStatus("เปลี่ยนช่วงแล้ว · กดจัดรูปแบบและตัดช่วงอีกครั้ง");
}

async function copyResult() {
  if (!state.processedText) {
    announce("ยังไม่มีผลลัพธ์ให้คัดลอก");
    return;
  }

  try {
    await copyText(state.processedText);
  } catch {
    setStatus("คัดลอกไม่สำเร็จ ลองกดดาวน์โหลดผลลัพธ์แทน", true);
    announce("คัดลอกไม่สำเร็จ");
    return;
  }

  dom.copyButton.textContent = "คัดลอกแล้ว ✓";
  window.clearTimeout(copiedLabelTimer);
  copiedLabelTimer = window.setTimeout(() => {
    dom.copyButton.textContent = COPY_LABEL;
  }, COPIED_LABEL_MS);
  announce("คัดลอกผลลัพธ์แล้ว");
}

function downloadResult() {
  if (!state.processedText || !state.outputFilename) {
    announce("ยังไม่มีผลลัพธ์ให้ดาวน์โหลด");
    return;
  }

  const blob = new Blob([state.processedText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = state.outputFilename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  announce(`ดาวน์โหลด ${state.outputFilename} แล้ว`);
}

export function initFileTools() {
  Object.assign(dom, {
    fileInput: document.querySelector("#source-text-file"),
    encoding: document.querySelector("#file-tools-encoding"),
    start: document.querySelector("#file-tools-start"),
    end: document.querySelector("#file-tools-end"),
    formatButton: document.querySelector("#format-file-button"),
    downloadButton: document.querySelector("#download-formatted-button"),
    copyButton: document.querySelector("#copy-formatted-button"),
    status: document.querySelector("#file-tools-status"),
    preview: document.querySelector("#file-tools-preview"),
    liveRegion: document.querySelector("#live-region"),
  });

  dom.fileInput.addEventListener("change", handleFileOrEncodingChange);
  dom.encoding.addEventListener("change", handleFileOrEncodingChange);
  dom.start.addEventListener("input", handleRangeInput);
  dom.end.addEventListener("input", handleRangeInput);
  dom.formatButton.addEventListener("click", processFile);
  dom.downloadButton.addEventListener("click", downloadResult);
  dom.copyButton.addEventListener("click", copyResult);
}
