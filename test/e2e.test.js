import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { scrapeChapterContent, scrapeTableOfContents } from "../scraper.js";
import { createApp } from "../server.js";

async function listen(listener) {
  const server = listener.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function close(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

test("served UI exposes the tabbed importer workspace", async () => {
  const app = await listen(createApp());

  try {
    const response = await fetch(`${app.url}/`);
    assert.equal(response.status, 200);

    const html = await response.text();
    for (const id of [
      "tab-importer",
      "tab-file-tools",
      "panel-importer",
      "toc-url",
      "range-from",
      "range-to",
      "select-range-button",
      "start-fetch-button",
      "stop-button",
      "retry-button",
      "export-button",
      "copy-button",
      "reset-button",
      "chapter-list",
      "progress-section",
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.doesNotMatch(html, /download-now-button|file-tools\.css|data-select-count/);
  } finally {
    await close(app.server);
  }
});

test("served UI includes local TXT formatting and range controls", async () => {
  const app = await listen(createApp());

  try {
    const response = await fetch(`${app.url}/`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /id="file-tools-panel"/);
    assert.match(html, /id="source-text-file"/);
    assert.match(html, /accept="\.txt,text\/plain"/);
    assert.match(html, /id="file-tools-encoding"/);
    assert.match(html, /value="Big5"/);
    assert.match(html, /id="file-tools-start"/);
    assert.match(html, /id="file-tools-end"/);
    assert.match(html, /value="205"/);
    assert.match(html, /value="400"/);
    assert.match(html, /id="format-file-button"/);
    assert.match(html, /id="download-formatted-button"/);
    assert.match(html, /id="copy-formatted-button"/);
    assert.match(html, /id="file-tools-preview"/);
  } finally {
    await close(app.server);
  }
});

test("API and scraper complete a ToC and chapter request through FlareSolverr", async () => {
  const flareCalls = [];
  const tocHtml = [
    "<ul id='catalog'>",
    ...Array.from(
      { length: 5 },
      (_, index) =>
        `<li><a href='/chapter/${index + 1}'>Chapter ${index + 1}</a></li>`,
    ),
    "</ul>",
  ].join("");
  const chapterHtml =
    "<div id='htmlContent'><h1>Chapter 1</h1><p>" +
    "ย่อหน้าเนื้อหาสำหรับทดสอบการเดินทางของข้อมูลผ่าน FlareSolverr ".repeat(5) +
    "</p></div>";

  const flareServer = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    flareCalls.push(body);
    const html = body.url.endsWith("/book") ? tocHtml : chapterHtml;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", solution: { response: html } }));
  });
  const flare = await listen(flareServer);

  const app = await listen(
    createApp({
      tocScraper: (url) =>
        scrapeTableOfContents(url, { flaresolverrUrl: flare.url }),
      chapterScraper: (url) =>
        scrapeChapterContent(url, { flaresolverrUrl: flare.url }),
    }),
  );

  try {
    const tocResponse = await fetch(`${app.url}/api/toc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/book" }),
    });
    assert.equal(tocResponse.status, 200);
    assert.equal((await tocResponse.json()).chapters.length, 5);

    const chapterResponse = await fetch(`${app.url}/api/chapter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/chapter/1" }),
    });
    assert.equal(chapterResponse.status, 200);
    assert.match((await chapterResponse.json()).content, /ย่อหน้า/);

    assert.equal(flareCalls.length, 2);
    assert.equal(flareCalls[0].cmd, "request.get");
    assert.equal(flareCalls[0].maxTimeout, 60000);
    assert.equal(flareCalls[1].cmd, "request.get");
    assert.equal(flareCalls[1].maxTimeout, 60000);
  } finally {
    await close(app.server);
    await close(flare.server);
  }
});
