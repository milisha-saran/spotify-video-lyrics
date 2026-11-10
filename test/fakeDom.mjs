class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.id = "";
    this.children = [];
    this.textContent = "";
    this.scrolls = [];
    this.listeners = {};
    const set = new Set();
    this.classes = set;
    this.classList = {
      add: (...n) => n.forEach((c) => set.add(c)),
      remove: (...n) => n.forEach((c) => set.delete(c)),
      toggle: (n, force) => (force ?? !set.has(n)) ? (set.add(n), true) : (set.delete(n), false),
      contains: (n) => set.has(n),
    };
  }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ type })); }
  scrollIntoView(opts) { this.scrolls.push(opts); }
}

export function createFakeDocument() {
  const head = new FakeElement("head");
  return {
    head,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => head.children.find((c) => c.id === id) ?? null,
  };
}
