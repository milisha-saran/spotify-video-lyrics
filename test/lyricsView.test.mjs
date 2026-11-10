import { test } from "node:test";
import assert from "node:assert/strict";
import { createLyricsView } from "../src/lyricsView.js";
import { createFakeDocument } from "./fakeDom.mjs";

const synced = { synced: true, lines: [
  { startMs: 1000, text: "a" }, { startMs: 5000, text: "b" } ] };

test("no lyrics shows the empty message", () => {
  const view = createLyricsView(createFakeDocument(), () => {});
  view.setLyrics(null);
  assert.equal(view.el.children.length, 1);
  assert.ok(view.el.children[0].classList.contains("vl-empty"));
  assert.equal(view.el.children[0].textContent, "No lyrics for this song");
});

test("marks past and current lines and scrolls once per index change", () => {
  const view = createLyricsView(createFakeDocument(), () => {});
  view.setLyrics(synced);
  view.setPosition(5200);
  const [a, b] = view.el.children;
  assert.ok(a.classList.contains("vl-past"));
  assert.ok(b.classList.contains("vl-current"));
  assert.equal(b.scrolls.length, 1);
  assert.deepEqual(b.scrolls[0], { block: "center", behavior: "smooth" });
  view.setPosition(5300);
  assert.equal(b.scrolls.length, 1);
});

test("upcoming lines are marked vl-next", () => {
  const view = createLyricsView(createFakeDocument(), () => {});
  view.setLyrics(synced);
  view.setPosition(1500);
  assert.ok(view.el.children[1].classList.contains("vl-next"));
  assert.ok(!view.el.children[0].classList.contains("vl-next"));
});

test("clicking a synced line seeks to its start", () => {
  const seeks = [];
  const view = createLyricsView(createFakeDocument(), (ms) => seeks.push(ms));
  view.setLyrics(synced);
  view.el.children[0].dispatch("click");
  assert.deepEqual(seeks, [1000]);
});

test("unsynced lyrics render with no current line and clicks do nothing", () => {
  const seeks = [];
  const view = createLyricsView(createFakeDocument(), (ms) => seeks.push(ms));
  view.setLyrics({ synced: false, lines: [{ startMs: null, text: "a" }, { startMs: null, text: "b" }] });
  view.setPosition(5000);
  assert.equal(view.el.children.length, 2);
  assert.ok(view.el.children.every((c) => !c.classList.contains("vl-current")));
  view.el.children[0].dispatch("click");
  assert.deepEqual(seeks, []);
});

test("style is inserted once per document", () => {
  const doc = createFakeDocument();
  createLyricsView(doc, () => {});
  createLyricsView(doc, () => {});
  assert.equal(doc.head.children.filter((c) => c.id === "vl-style").length, 1);
});

test("new lyrics reset the scroll tracking", () => {
  const view = createLyricsView(createFakeDocument(), () => {});
  view.setLyrics(synced);
  view.setPosition(5200);
  view.setLyrics(synced);
  view.setPosition(5200);
  assert.equal(view.el.children[1].scrolls.length, 1);
});

test("loading clears the old lines so they can no longer seek", () => {
  const seeks = [];
  const view = createLyricsView(createFakeDocument(), (ms) => seeks.push(ms));
  view.setLyrics(synced);
  const oldLine = view.el.children[0];
  view.showLoading();
  assert.equal(view.el.children.length, 1);
  assert.ok(view.el.children[0].classList.contains("vl-empty"));
  assert.equal(view.el.children[0].textContent, "Loading lyrics…");
  assert.ok(!view.el.classList.contains("vl-synced"));
  view.setPosition(5200);
  assert.equal(oldLine.scrolls.length, 0);
});

test("lyrics replace the loading message", () => {
  const view = createLyricsView(createFakeDocument(), () => {});
  view.showLoading();
  view.setLyrics(synced);
  assert.equal(view.el.children.length, 2);
  assert.equal(view.el.children[0].textContent, "a");
});
