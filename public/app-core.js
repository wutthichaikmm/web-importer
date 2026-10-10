const TEXT_DECODERS = [
  { label: "UTF-8", decoder: "utf-8" },
  { label: "GB18030", decoder: "gb18030" },
  { label: "GBK", decoder: "gbk" },
  { label: "Big5", decoder: "big5" },
];

function decoderCandidates(preferredEncoding) {
  const requested = String(preferredEncoding ?? "auto").trim().toLowerCase();
  if (!requested || requested === "auto") return [TEXT_DECODERS[0]];

  const candidate = TEXT_DECODERS.find(
    ({ label, decoder }) =>
      label.toLowerCase() === requested || decoder.toLowerCase() === requested,
  );
  return candidate ? [candidate] : [];
}

export function decodeTextBuffer(buffer, preferredEncoding = "auto") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const candidates = decoderCandidates(preferredEncoding);

  for (const candidate of candidates) {
    try {
      const decoder = new TextDecoder(candidate.decoder, { fatal: true });
      return {
        encoding: candidate.label,
        text: decoder.decode(bytes),
      };
    } catch {
      // Try the next supported encoding.
    }
  }

  if (String(preferredEncoding ?? "auto").trim().toLowerCase() === "auto") {
    throw new Error(
      "อ่านไฟล์แบบอัตโนมัติไม่สำเร็จ กรุณาเลือก encoding ของไฟล์",
    );
  }
  throw new Error("ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบ encoding ของไฟล์");
}

const CHAPTER_HEADING_LINE_PATTERN = /(^|\n)[ \t]*(第\d+章[^\n]*?)[ \t]*(?=\n|$)/g;
const CHAPTER_HEADING_PATTERN = /^[ \t]*第(\d+)章[^\n]*$/gm;

export function formatNovelText(value) {
  let text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/第(\d+)(?!章)([^\d\n])/g, "第$1章$2")
    .replace(CHAPTER_HEADING_LINE_PATTERN, "\n\n$2\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text ? `${text}\n` : "\n";
}

function positiveInteger(value) {
  const stringValue = String(value ?? "").trim();
  if (!/^\d+$/.test(stringValue)) return null;

  const parsed = Number(stringValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function chapterHeadings(text) {
  return [...text.matchAll(CHAPTER_HEADING_PATTERN)].map((match) => ({
    index: match.index,
    number: Number(match[1]),
  }));
}

export function extractChapterRange(value, start, end) {
  const startNumber = positiveInteger(start);
  const endNumber = positiveInteger(end);
  if (startNumber === null || endNumber === null) {
    throw new Error("ช่วงตอนต้องเป็นจำนวนเต็มบวก");
  }
  if (startNumber > endNumber) {
    throw new Error("ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด");
  }

  const text = String(value ?? "");
  const headings = chapterHeadings(text);
  const startHeading = headings.find(({ number }) => number === startNumber);
  if (!startHeading) {
    throw new Error(`ไม่พบตอนเริ่มต้น 第${startNumber}章`);
  }

  const nextHeading = headings.find(
    ({ index, number }) => index > startHeading.index && number > endNumber,
  );
  const result = text
    .slice(startHeading.index, nextHeading?.index ?? text.length)
    .trim();
  return result ? `${result}\n` : "\n";
}

export function formatPostProcessFilename(start, end) {
  return `formatted-chapters-${String(start).trim()}-${String(end).trim()}.txt`;
}

function sleep(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    let timeoutId;
    const finish = (completed) => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);

    timeoutId = setTimeout(() => finish(true), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isActiveRequest(activeController, controller) {
  return Boolean(
    controller && activeController === controller && !controller.signal.aborted,
  );
}

export async function runWithConcurrency(
  entries,
  concurrency,
  worker,
  delayMs = 0,
  options = {},
) {
  const limit = Math.min(12, Math.max(1, Number(concurrency) || 1));
  const delay = Math.max(0, Number(delayMs) || 0);
  const signal = options?.signal;
  let nextIndex = 0;
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  await Promise.all(
    Array.from({ length: Math.min(limit, entries.length || 1) }, async () => {
      while (nextIndex < entries.length && !signal?.aborted) {
        const index = nextIndex;
        nextIndex += 1;

        // Keep starts at least `delay` apart across all workers. Re-check after
        // waking because coarse timers can wake several workers on one tick.
        let wait = lastStartedAt + delay - Date.now();
        while (wait > 0) {
          if (!(await sleep(wait, signal))) return;
          wait = lastStartedAt + delay - Date.now();
        }

        if (signal?.aborted) {
          return;
        }

        lastStartedAt = Date.now();
        await worker(entries[index], index);
      }
    }),
  );
}

function normalizeExportText(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
}

const CHAPTER_MARKER_PATTERN =
  /^第\s*[0-9０-９零〇一二兩两三四五六七八九十百千萬万]+\s*[章节節回]/;

function splitChapterTitle(line) {
  const marker = line.match(CHAPTER_MARKER_PATTERN)?.[0] ?? "";
  const name = normalizeExportText(line.slice(marker.length));
  return { marker, name, key: name.replace(/[\p{P}\p{S}]/gu, "") };
}

function isSameTitleKey(left, right) {
  const length = Math.min(left.length, right.length);
  let differences = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) differences += 1;
  }
  // Allow one variant character (e.g. 隻/只) once the title is long enough.
  return length > 0 && differences <= (length >= 4 ? 1 : 0);
}

// Chapter pages often repeat the title as their first line, but the TOC
// version may be truncated, lose punctuation, or carry a different chapter
// number. Treat those as the same title so the export keeps a single
// heading: the TOC chapter number with the most complete name.
function mergeLeadingTitle(title, content) {
  const [firstLine, ...remainingLines] = content.split(/\r?\n/);
  const heading = firstLine.trim();
  const remainingContent = remainingLines.join("\n").trim();
  if (normalizeExportText(heading) === normalizeExportText(title)) {
    return { title, content: remainingContent };
  }

  const fromTitle = splitChapterTitle(title);
  const fromContent = splitChapterTitle(heading);
  if (!fromContent.marker || !isSameTitleKey(fromTitle.key, fromContent.key)) {
    return { title, content };
  }

  const mergedTitle =
    fromContent.name.length > fromTitle.name.length
      ? `${fromTitle.marker || fromContent.marker}${heading.slice(fromContent.marker.length)}`
      : title;
  return { title: mergedTitle, content: remainingContent };
}

export function buildExportText(entries) {
  return entries
    .map(({ title, content }) => {
      const cleanTitle = String(title ?? "").trim();
      const cleanContent = String(content ?? "").trim();
      const merged =
        cleanTitle && cleanContent
          ? mergeLeadingTitle(cleanTitle, cleanContent)
          : { title: cleanTitle, content: cleanContent };
      return `${merged.title}\n\n${merged.content}`;
    })
    .join("\n\n\n");
}

export function selectChapterRange(chapters, from, to) {
  const fromNumber = positiveInteger(from);
  const toNumber = positiveInteger(to);
  if (fromNumber === null || toNumber === null) {
    throw new Error("ช่วงตอนต้องเป็นจำนวนเต็มบวก");
  }
  if (fromNumber > toNumber) {
    throw new Error("ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด");
  }

  const inRange = ({ chapterNumber }) =>
    chapterNumber >= fromNumber && chapterNumber <= toNumber;
  if (!chapters.some(inRange)) {
    throw new Error(`ไม่พบตอนในช่วง ${fromNumber}–${toNumber}`);
  }

  return chapters.map((chapter) => ({ ...chapter, selected: inRange(chapter) }));
}

export function chaptersToStart(chapters) {
  return chapters.filter(
    ({ selected, status }) => selected && status === "idle",
  );
}

export function chaptersToRetry(chapters) {
  return chapters.filter(
    ({ selected, status }) =>
      selected && (status === "error" || status === "stopped"),
  );
}

export function exportableChapters(chapters) {
  return chapters.filter(
    ({ selected, status }) => selected && status === "done",
  );
}

export function runProgress(chapters) {
  const count = (status) =>
    chapters.filter((chapter) => chapter.status === status).length;
  const done = count("done");
  const error = count("error");
  const stopped = count("stopped");

  return {
    total: chapters.length,
    finished: done + error + stopped,
    done,
    error,
    stopped,
    remaining: count("queued") + count("fetching"),
  };
}

export function importerControls({ chapters, tocLoading, running, stopping }) {
  const startCount = chaptersToStart(chapters).length;
  const retryCount = chaptersToRetry(chapters).length;
  const downloadCount = exportableChapters(chapters).length;

  return {
    total: chapters.length,
    selected: chapters.filter((chapter) => chapter.selected).length,
    locked: tocLoading || running,
    numbering: { disabled: tocLoading || running },
    leaveWarning: running || chapters.some((chapter) => chapter.status === "done"),
    start: {
      visible: !running,
      disabled: tocLoading || startCount === 0,
      count: startCount,
    },
    stop: { visible: running, disabled: stopping },
    retry: {
      visible: !running && retryCount > 0,
      disabled: tocLoading,
      count: retryCount,
    },
    download: { disabled: downloadCount === 0, count: downloadCount },
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatExportFilename(date) {
  return [
    "chapters-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    ".txt",
  ].join("");
}
