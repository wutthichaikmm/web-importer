import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportText,
  chaptersToRetry,
  chaptersToStart,
  decodeTextBuffer,
  exportableChapters,
  extractChapterRange,
  formatNovelText,
  formatExportFilename,
  formatPostProcessFilename,
  importerControls,
  isActiveRequest,
  runProgress,
  runWithConcurrency,
  selectChapterRange,
} from "../public/app-core.js";

test("decodeTextBuffer reads UTF-8 BOM text", () => {
  const buffer = new TextEncoder().encode("\uFEFF第205章 起点").buffer;

  assert.deepEqual(decodeTextBuffer(buffer), {
    encoding: "UTF-8",
    text: "第205章 起点",
  });
});

test("decodeTextBuffer honors an explicit legacy encoding", () => {
  const buffer = Uint8Array.from([0xa4, 0xa4, 0xa4, 0xe5]).buffer;

  assert.deepEqual(decodeTextBuffer(buffer, "Big5"), {
    encoding: "Big5",
    text: "中文",
  });
});

test("decodeTextBuffer does not guess ambiguous legacy bytes in auto mode", () => {
  const buffer = Uint8Array.from([0xa4, 0xa4, 0xa4, 0xe5]).buffer;

  assert.throws(
    () => decodeTextBuffer(buffer),
    /กรุณาเลือก encoding/,
  );
});

test("formatNovelText adds missing chapter markers and normalizes spacing", () => {
  assert.equal(
    formatNovelText("前言\r\n第899抱一下吧\r\n正文\r\n\r\n\r\n第900章 下一章"),
    "前言\n\n第899章抱一下吧\n\n正文\n\n第900章 下一章\n",
  );
});

test("formatNovelText does not promote inline chapter mentions", () => {
  assert.equal(
    formatNovelText("正文提到第123章但不是标题\n第205章 起点"),
    "正文提到第123章但不是标题\n\n第205章 起点\n",
  );
});

test("extractChapterRange includes the requested chapters only", () => {
  const text = formatNovelText(
    "第204章 ก่อนหน้า\nเนื้อหา\n第205章 起点\nเนื้อหา 205\n第400章 จบช่วง\nเนื้อหา 400\n第401章 ถัดไป\nเนื้อหา 401",
  );

  assert.equal(
    extractChapterRange(text, 205, 400),
    "第205章 起点\n\nเนื้อหา 205\n\n第400章 จบช่วง\n\nเนื้อหา 400\n",
  );
  assert.doesNotMatch(extractChapterRange(text, 205, 400), /第401章/);
});

test("extractChapterRange stops at the first later chapter", () => {
  const text = formatNovelText(
    "第205章 起点\nเนื้อหา 205\n第402章 ถัดไป\nเนื้อหา 402",
  );

  assert.equal(
    extractChapterRange(text, 205, 400),
    "第205章 起点\n\nเนื้อหา 205\n",
  );
});

test("extractChapterRange rejects invalid or missing ranges", () => {
  assert.throws(
    () => extractChapterRange("第205章 起点", 400, 205),
    /ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด/,
  );
  assert.throws(
    () => extractChapterRange("第205章 起点", 204, 205),
    /ไม่พบตอนเริ่มต้น 第204章/,
  );
  assert.throws(
    () => extractChapterRange("第205章 起点", 0, 205),
    /ช่วงตอนต้องเป็นจำนวนเต็มบวก/,
  );
});

test("formatPostProcessFilename includes the selected range", () => {
  assert.equal(
    formatPostProcessFilename(205, 400),
    "formatted-chapters-205-400.txt",
  );
});

test("buildExportText creates ordered chapter sections", () => {
  assert.equal(
    buildExportText([
      {
        chapterNumber: 1,
        title: "第一章",
        content: "เนื้อหาแรก",
      },
      {
        chapterNumber: 2,
        title: "第二章",
        content: "เนื้อหาที่สอง",
      },
    ]),
    "第一章\n\nเนื้อหาแรก\n\n\n第二章\n\nเนื้อหาที่สอง",
  );
});

test("buildExportText removes a duplicated leading chapter title", () => {
  const title = "第101章 哪怕他想不起我，但我記得他就好";

  assert.equal(
    buildExportText([
      {
        chapterNumber: 101,
        title,
        content: `${title}\n\n姜清漪離開之後，嚴如雪將馬車帶回了事發地點。`,
      },
    ]),
    `${title}\n\n姜清漪離開之後，嚴如雪將馬車帶回了事發地點。`,
  );
});

test("buildExportText merges a truncated TOC title with the full content title", () => {
  assert.equal(
    buildExportText([
      {
        title: "第221章 若你再跟著我，下一個斬的就是你（",
        content:
          "第221章 若你再跟著我，下一個斬的就是你（二章合一，4600字）\n\n“給我滾！”",
      },
    ]),
    "第221章 若你再跟著我，下一個斬的就是你（二章合一，4600字）\n\n“給我滾！”",
  );
});

test("buildExportText keeps the TOC chapter number when the content heading differs", () => {
  assert.equal(
    buildExportText([
      {
        title: "第215章 蕭大哥，你真的沒事嗎？",
        content: "第214章 蕭大哥，你真的沒事嗎？\n\n看著面前的女子，蕭墨神色微動。",
      },
      {
        title: "第217章 為了修行，真的什麼都不需要在乎嗎",
        content: "第216章 為了修行，真的什麼都不需要在乎嗎？\n\n當天晚上。",
      },
    ]),
    "第215章 蕭大哥，你真的沒事嗎？\n\n看著面前的女子，蕭墨神色微動。" +
      "\n\n\n" +
      "第217章 為了修行，真的什麼都不需要在乎嗎？\n\n當天晚上。",
  );
});

test("buildExportText matches a TOC title that dropped inner punctuation", () => {
  assert.equal(
    buildExportText([
      {
        title: "第229章 人家對成為宗主夫人倒是很有興趣",
        content: "第228章 人家對成為宗主夫人……倒是很有興趣\n\n本文",
      },
      {
        title: "第187章 我我想跟你一起走",
        content: "第187章 我.我想跟你一起走\n\n本文",
      },
    ]),
    "第229章 人家對成為宗主夫人……倒是很有興趣\n\n本文" +
      "\n\n\n" +
      "第187章 我.我想跟你一起走\n\n本文",
  );
});

test("buildExportText tolerates one variant character in the TOC title", () => {
  assert.equal(
    buildExportText([
      {
        title: "第355章 既然天下女子都沒我好看，那蕭墨隻",
        content: "第355章 既然天下女子都沒我好看，那蕭墨只能選我呀~\n\n本文",
      },
      {
        title: "第1章 天下",
        content: "第1章 大道\n\n本文",
      },
    ]),
    "第355章 既然天下女子都沒我好看，那蕭墨只能選我呀~\n\n本文" +
      "\n\n\n" +
      "第1章 天下\n\n第1章 大道\n\n本文",
  );
});

test("buildExportText keeps a first paragraph that only starts with the title", () => {
  assert.equal(
    buildExportText([{ title: "序", content: "序幕拉開，眾人入座。\n\n下一段" }]),
    "序\n\n序幕拉開，眾人入座。\n\n下一段",
  );
});

test("formatExportFilename uses local date and time", () => {
  assert.equal(
    formatExportFilename(new Date(2026, 8, 1, 14, 5)),
    "chapters-20260901-1405.txt",
  );
});

test("runWithConcurrency never exceeds active worker count", async () => {
  let active = 0;
  let maxActive = 0;
  const completed = [];

  await runWithConcurrency(
    [1, 2, 3, 4, 5],
    2,
    async (entry) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(entry);
      active -= 1;
    },
    0,
  );

  assert.equal(maxActive, 2);
  assert.deepEqual(
    completed.sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
  );
});

test("runWithConcurrency spaces starts by the delay without growing it", async () => {
  const delay = 5;
  const startedAt = [];

  await runWithConcurrency(
    Array.from({ length: 40 }, (_, index) => index),
    4,
    async () => {
      startedAt.push(Date.now());
    },
    delay,
  );

  const gaps = startedAt.slice(1).map((time, index) => time - startedAt[index]);
  assert.ok(
    gaps.every((gap) => gap >= delay),
    `starts closer than ${delay}ms: ${gaps.join(",")}`,
  );

  const average = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const early = average(gaps.slice(0, 10));
  const late = average(gaps.slice(-10));
  assert.ok(late < early * 2 + delay, `gaps grew from ~${early}ms to ~${late}ms`);
});

test("runWithConcurrency stops queued work after abort", async () => {
  const controller = new AbortController();
  const started = [];

  await runWithConcurrency(
    [1, 2, 3],
    1,
    async (entry) => {
      started.push(entry);
      controller.abort();
    },
    0,
    { signal: controller.signal },
  );

  assert.deepEqual(started, [1]);
});

test("isActiveRequest rejects stale or aborted requests", () => {
  const controller = new AbortController();

  assert.equal(isActiveRequest(controller, controller), true);

  controller.abort();
  assert.equal(isActiveRequest(controller, controller), false);
  assert.equal(isActiveRequest(null, controller), false);
  assert.equal(isActiveRequest(null, null), false);
});

const chapter = (idx, overrides = {}) => ({
  idx,
  title: `第${idx + 1}章`,
  url: `https://example.com/${idx + 1}`,
  chapterNumber: idx + 1,
  selected: true,
  status: "idle",
  content: "",
  error: "",
  ...overrides,
});
const ids = (chapters) => chapters.map(({ idx }) => idx);

test("selectChapterRange selects the inclusive range without mutating input", () => {
  const chapters = Array.from({ length: 5 }, (_, i) =>
    chapter(i, { selected: i === 0 }),
  );

  assert.deepEqual(
    selectChapterRange(chapters, "2", "4").map((item) => item.selected),
    [false, true, true, true, false],
  );
  assert.equal(chapters[0].selected, true);
});

test("selectChapterRange matches displayed chapter numbers", () => {
  const chapters = Array.from({ length: 5 }, (_, i) =>
    chapter(i, { chapterNumber: 101 + i }),
  );

  assert.deepEqual(
    selectChapterRange(chapters, 102, 103).map((item) => item.selected),
    [false, true, true, false, false],
  );
});

test("selectChapterRange rejects invalid ranges", () => {
  const chapters = Array.from({ length: 5 }, (_, i) => chapter(i));

  for (const [from, to] of [
    ["", "3"],
    ["0", "3"],
    ["1.5", "3"],
    ["2", "x"],
  ]) {
    assert.throws(
      () => selectChapterRange(chapters, from, to),
      /ช่วงตอนต้องเป็นจำนวนเต็มบวก/,
    );
  }
  assert.throws(
    () => selectChapterRange(chapters, "4", "2"),
    /ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด/,
  );
  assert.throws(
    () => selectChapterRange(chapters, "50", "60"),
    /ไม่พบตอนในช่วง 50–60/,
  );
});

test("chaptersToStart returns selected chapters never fetched", () => {
  const chapters = [
    chapter(0),
    chapter(1, { selected: false }),
    chapter(2, { status: "done" }),
    chapter(3, { status: "error" }),
    chapter(4, { status: "stopped" }),
  ];

  assert.deepEqual(ids(chaptersToStart(chapters)), [0]);
});

test("chaptersToRetry returns selected failed or stopped chapters", () => {
  const chapters = [
    chapter(0, { status: "done" }),
    chapter(1, { status: "error", selected: false }),
    chapter(2, { status: "error" }),
    chapter(3, { status: "stopped" }),
    chapter(4),
  ];

  assert.deepEqual(ids(chaptersToRetry(chapters)), [2, 3]);
});

test("exportableChapters keeps list order of selected done chapters", () => {
  const chapters = [
    chapter(2, { status: "done" }),
    chapter(0, { status: "done" }),
    chapter(1, { status: "done", selected: false }),
    chapter(3, { status: "error" }),
  ];

  assert.deepEqual(ids(exportableChapters(chapters)), [2, 0]);
});

test("runProgress counts the chapters of a run", () => {
  const statuses = ["done", "done", "error", "stopped", "fetching", "queued"];

  assert.deepEqual(
    runProgress(statuses.map((status, i) => chapter(i, { status }))),
    { total: 6, finished: 4, done: 2, error: 1, stopped: 1, remaining: 2 },
  );
});

test("importerControls enables start as soon as the TOC has loaded", () => {
  const controls = importerControls({
    chapters: [chapter(0), chapter(1), chapter(2)],
    tocLoading: false,
    running: false,
    stopping: false,
  });

  assert.deepEqual(controls.start, { visible: true, disabled: false, count: 3 });
  assert.equal(controls.stop.visible, false);
  assert.equal(controls.retry.visible, false);
  assert.deepEqual(controls.download, { disabled: true, count: 0 });
  assert.equal(controls.locked, false);
  assert.equal(controls.selected, 3);
  assert.equal(controls.total, 3);
});

test("importerControls disables start while the TOC is loading", () => {
  const controls = importerControls({
    chapters: [chapter(0)],
    tocLoading: true,
    running: false,
    stopping: false,
  });

  assert.equal(controls.start.disabled, true);
  assert.equal(controls.locked, true);
});

test("importerControls swaps start for stop while running and keeps download", () => {
  const controls = importerControls({
    chapters: [
      chapter(0, { status: "done" }),
      chapter(1, { status: "fetching" }),
      chapter(2, { status: "queued" }),
    ],
    tocLoading: false,
    running: true,
    stopping: false,
  });

  assert.equal(controls.start.visible, false);
  assert.deepEqual(controls.stop, { visible: true, disabled: false });
  assert.deepEqual(controls.download, { disabled: false, count: 1 });
  assert.equal(controls.retry.visible, false);
  assert.equal(controls.locked, true);
});

test("importerControls disables stop once stopping", () => {
  const controls = importerControls({
    chapters: [chapter(0, { status: "fetching" })],
    tocLoading: false,
    running: true,
    stopping: true,
  });

  assert.equal(controls.stop.disabled, true);
});

test("importerControls offers retry for failed chapters after a run", () => {
  const controls = importerControls({
    chapters: [
      chapter(0, { status: "done" }),
      chapter(1, { status: "error" }),
      chapter(2, { status: "stopped" }),
      chapter(3, { selected: false }),
    ],
    tocLoading: false,
    running: false,
    stopping: false,
  });

  assert.deepEqual(controls.retry, { visible: true, disabled: false, count: 2 });
  assert.deepEqual(controls.start, { visible: true, disabled: true, count: 0 });
});

test("importerControls lets the start number be set before a TOC loads", () => {
  const idle = importerControls({ chapters: [], tocLoading: false, running: false, stopping: false });
  const running = importerControls({
    chapters: [chapter(0, { status: "fetching" })],
    tocLoading: false,
    running: true,
    stopping: false,
  });

  assert.deepEqual(idle.numbering, { disabled: false });
  assert.deepEqual(running.numbering, { disabled: true });
});

test("importerControls warns before leaving when fetched work would be lost", () => {
  const controlsFor = (chapters, running = false) =>
    importerControls({ chapters, tocLoading: false, running, stopping: false });

  assert.equal(controlsFor([]).leaveWarning, false);
  assert.equal(controlsFor([chapter(0)]).leaveWarning, false);
  assert.equal(controlsFor([chapter(0, { status: "done", selected: false })]).leaveWarning, true);
  assert.equal(controlsFor([chapter(0, { status: "queued" })], true).leaveWarning, true);
});
