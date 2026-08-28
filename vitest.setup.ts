import "@testing-library/jest-dom/vitest";

// ProseMirror reads browser geometry while placing a contenteditable cursor.
// jsdom intentionally does not implement these layout APIs, so expose the
// empty geometry it would observe in this non-visual test environment.
if (document.elementFromPoint === undefined) {
  document.elementFromPoint = () => null;
}

if (Range.prototype.getClientRects === undefined) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

if (Range.prototype.getBoundingClientRect === undefined) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
