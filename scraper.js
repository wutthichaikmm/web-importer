import { HTMLElement, parse } from "node-html-parser";

export const DEFAULT_FLARESOLVERR_URL = "http://127.0.0.1:8191";
const FLARESOLVERR_TIMEOUT_MS = 60000;

const TOC_SELECTORS = [
  "#catalog li a",
  ".catalog li a",
  ".catalog_list li a",
  ".mulu li a",
  "#mulu li a",
  "#list dl dd a",
  ".listmain dl dd a",
  "#chapter_list li a",
  "#list-chapterAll li a",
  ".catalog-list li a",
  ".chapter-list li a",
  "#chapterList li a",
  "#chapterlist li a",
  "ul.clearfix li a",
  ".booklist li a",
  ".chaplist li a",
  "#all li a",
  ".book_list li a",
  "#list li a",
  "#readerFull li a",
  ".read li a",
  ".u-chapter li a",
  "dl.dir dd a",
  ".book_list ul li a",
  "table tbody tr td a",
  ".chapters_frame div .chapter_cell a",
  ".page-content-listing li a",
];

const CONTENT_SELECTORS = [
  ".txtnav",
  "#htmlContent",
  "#chapter_content",
  "#chaptercontent",
  ".chapter-content",
  ".chapter-content div .content",
  "#booktext",
  ".read-content",
  "#readcontent",
  "#neirong",
  ".showtxt",
  "#txt",
  "#content",
  ".content",
  ".page-content",
  ".read-container .text-left",
];

const NOISE_PATTERNS = [
  /本章完/,
  /全文字小说/,
  /笔趣阁/,
  /手机阅读/,
  /www\.\S+/,
  /请收藏.*章节/,
  /推荐.*小说/,
  /上一章|下一章/,
  /\(本章完\)/,
];

const CONTENT_NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "h1",
  "h2",
  "h3",
  "footer",
  "header",
  "nav",
  ".nav",
  "#nav",
  ".navbar",
  "#navbar",
  ".chapter-actions",
  ".page1",
  ".page2",
  ".pages",
  ".contentadv",
  ".ad",
  ".ads",
  "#ad",
  "#ads",
  ".adsbygoogle",
].join(", ");

export function validateTargetUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "รองรับเฉพาะ URL http และ https" };
    }
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, error: "URL ไม่ถูกต้อง" };
  }
}

function resolveUrl(baseUrl, href) {
  if (!href || href.startsWith("javascript:") || href === "#") {
    return "";
  }

  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

function getFlareSolverrUrl(options) {
  return (
    options.flaresolverrUrl ??
    process.env.FLARESOLVERR_URL ??
    DEFAULT_FLARESOLVERR_URL
  ).replace(/\/+$/, "");
}

export async function requestViaFlareSolverr(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${getFlareSolverrUrl(options)}/v1`;
  const requestBody = {
    cmd: "request.get",
    url,
    maxTimeout: FLARESOLVERR_TIMEOUT_MS,
  };

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new Error(
      `FlareSolverr unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      `FlareSolverr error: invalid JSON response (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (
    !response.ok ||
    data?.status !== "ok" ||
    typeof data?.solution?.response !== "string"
  ) {
    const detail =
      data?.message ?? `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`FlareSolverr error: ${detail}`);
  }

  return data.solution.response;
}

function extractLinks(root, selector, baseUrl) {
  return root
    .querySelectorAll(selector)
    .map((anchor) => ({
      title: anchor.text.replaceAll("\u00a0", " ").trim(),
      url: resolveUrl(baseUrl, anchor.getAttribute("href") ?? ""),
    }))
    .filter(
      (chapter) =>
        chapter.url && chapter.title.length > 0 && chapter.title.length < 120,
    );
}

export function extractTableOfContents(html, baseUrl) {
  const root = parse(html);
  root
    .querySelectorAll("script, style, noscript, footer, header, nav")
    .forEach((element) => element.remove());

  for (const selector of TOC_SELECTORS) {
    const chapters = extractLinks(root, selector, baseUrl);
    if (chapters.length > 0) return chapters;
  }

  let bestElement = null;
  let bestCount = 0;
  for (const element of root.querySelectorAll("div, ul, ol, dl, table")) {
    const count = element.querySelectorAll("a").length;
    if (count > bestCount) {
      bestCount = count;
      bestElement = element;
    }
  }

  return bestElement ? extractLinks(bestElement, "a", baseUrl) : [];
}

function normalizeComparableText(text) {
  return text.replaceAll(/\s+/g, "").trim();
}

function cleanLines(lines, headingText = "") {
  const filtered = lines
    .map((line) => line.replaceAll("\u00a0", " ").trim())
    .filter(Boolean)
    .filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line)));

  if (
    filtered.length > 0 &&
    headingText &&
    normalizeComparableText(filtered[0]) === normalizeComparableText(headingText)
  ) {
    filtered.shift();
  }

  return filtered;
}

function prepareContentElement(element) {
  const contentRoot = element.clone();
  const headingText =
    element.querySelector("h1, h2, h3")?.text.replaceAll("\u00a0", " ").trim() ??
    "";

  contentRoot
    .querySelectorAll(CONTENT_NOISE_SELECTORS)
    .forEach((node) => node.remove());

  return { contentRoot, headingText };
}

function extractBrSeparatedText(element) {
  const htmlWithBreaks = element.innerHTML
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<bbr\s*\/?>/gi, "\n")
    .replaceAll(/&nbsp;/gi, " ")
    .replaceAll(/&emsp;/gi, " ");

  return htmlWithBreaks
    .split(/\n+/)
    .map((chunk) => parse(`<div>${chunk}</div>`).text)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractTextFromElement(element) {
  const { contentRoot, headingText } = prepareContentElement(element);

  const paragraphs = cleanLines(
    contentRoot.querySelectorAll("p").map((paragraph) => paragraph.text),
    headingText,
  );
  if (paragraphs.length > 0) return paragraphs.join("\n\n");

  const leafDivs = contentRoot
    .querySelectorAll("div")
    .filter((div) => div.querySelectorAll("div").length === 0);
  const divLines = cleanLines(
    leafDivs.map((div) => div.text),
    headingText,
  );
  if (divLines.length > 0) return divLines.join("\n\n");

  const brLines = cleanLines(extractBrSeparatedText(contentRoot), headingText);
  if (brLines.length > 0) return brLines.join("\n\n");

  return cleanLines(contentRoot.structuredText.split(/\r?\n/), headingText).join(
    "\n\n",
  );
}

export function extractChapterText(html) {
  const root = parse(html);
  root
    .querySelectorAll(
      "script, style, noscript, .ad, .ads, #ad, #ads, .adsbygoogle, .nav, #nav, .navbar, #navbar, nav",
    )
    .forEach((element) => element.remove());

  for (const selector of CONTENT_SELECTORS) {
    const element = root.querySelector(selector);
    if (!element) continue;
    const text = extractTextFromElement(element);
    if (text.length > 0) return text;
  }

  let bestElement = null;
  let bestLength = 0;
  for (const element of root.querySelectorAll("div, article, section")) {
    const length = element.text.trim().length;
    if (length > bestLength) {
      bestLength = length;
      bestElement = element;
    }
  }

  return bestElement ? extractTextFromElement(bestElement) : "";
}

export async function scrapeTableOfContents(url, options = {}) {
  try {
    const html = await requestViaFlareSolverr(url, options);
    const chapters = extractTableOfContents(html, url);
    return chapters.length >= 5
      ? { chapters, error: null }
      : {
          chapters: [],
          error:
            "ไม่พบรายการ chapter ในหน้านี้ — ลองตรวจสอบ URL หรือเลือกหน้าสารบัญโดยตรง",
        };
  } catch (error) {
    return {
      chapters: [],
      error:
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการดึงสารบัญ",
    };
  }
}

export async function scrapeChapterContent(url, options = {}) {
  try {
    const html = await requestViaFlareSolverr(url, options);
    const content = extractChapterText(html);
    return content.length > 100
      ? { content, error: null }
      : { content: "", error: "ไม่พบเนื้อหาในหน้านี้" };
  } catch (error) {
    return {
      content: "",
      error:
        error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงเนื้อหา",
    };
  }
}
