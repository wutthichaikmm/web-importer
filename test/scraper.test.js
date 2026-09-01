import assert from "node:assert/strict";
import test from "node:test";

import {
  extractChapterText,
  extractTableOfContents,
  requestViaFlareSolverr,
  validateTargetUrl,
} from "../scraper.js";

test("validateTargetUrl accepts http/https and rejects other schemes", () => {
  assert.deepEqual(validateTargetUrl("https://example.com/book/123"), {
    ok: true,
    url: "https://example.com/book/123",
  });
  assert.equal(validateTargetUrl("ftp://example.com/book").ok, false);
  assert.equal(validateTargetUrl("not-a-url").ok, false);
});

test("extractTableOfContents resolves relative links and skips invalid links", () => {
  const html = [
    "<ul id='catalog'>",
    "<li><a href='/book/123/1'>Chapter 1</a></li>",
    "<li><a href='chapter-2.html'>Chapter 2</a></li>",
    "<li><a href='javascript:void(0)'>Skip me</a></li>",
    "<li><a href='#'>Skip anchor</a></li>",
    "</ul>",
  ].join("");

  assert.deepEqual(
    extractTableOfContents(html, "https://example.com/book/123/"),
    [
      { title: "Chapter 1", url: "https://example.com/book/123/1" },
      {
        title: "Chapter 2",
        url: "https://example.com/book/123/chapter-2.html",
      },
    ],
  );
});

test("extractChapterText keeps paragraphs and removes page noise", () => {
  const html = [
    "<nav>เมนูเว็บ</nav>",
    "<div id='htmlContent'>",
    "<h1>Chapter 1</h1>",
    "<p>ย่อหน้าแรก</p>",
    "<p>ย่อหน้าที่สอง</p>",
    "<script>window.ad = true</script>",
    "<div class='ad'>ซื้อโฆษณา</div>",
    "<p>本章完</p>",
    "</div>",
  ].join("");

  assert.equal(
    extractChapterText(html),
    "ย่อหน้าแรก\n\nย่อหน้าที่สอง",
  );
});

test("requestViaFlareSolverr sends request.get to the configured endpoint", async () => {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        status: "ok",
        solution: { response: "<html>ok</html>" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const html = await requestViaFlareSolverr(
    "https://example.com/chapter/1",
    {
      fetchImpl,
      flaresolverrUrl: "http://127.0.0.1:8191",
    },
  );

  assert.equal(html, "<html>ok</html>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "http://127.0.0.1:8191/v1");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    cmd: "request.get",
    url: "https://example.com/chapter/1",
    maxTimeout: 60000,
  });
});
