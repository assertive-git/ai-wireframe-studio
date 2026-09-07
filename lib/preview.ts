export function previewDocument(html: string, css: string, inlineEditing = false) {
  const editing = inlineEditing ? "true" : "false";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
html,body{margin:0;padding:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}
*{box-sizing:border-box}
${css}
#lp-root[data-inline-editing="true"] [contenteditable="true"]{outline:none}
</style>
</head>
<body>
<div id="lp-root">${html}</div>
<script>
(() => {
  let inlineEditing = ${editing};
  const root = document.getElementById('lp-root');
  const originalEditing = new Map();
  function setInlineEditing(enabled) {
    inlineEditing = enabled;
    root.dataset.inlineEditing = String(enabled);
    if (enabled) {
      root.querySelectorAll('h1,h2,h3,h4,p,li,a,button,span').forEach((el) => {
        if (el.closest('[data-no-inline-edit]')) return;
        if (!originalEditing.has(el)) originalEditing.set(el, el.getAttribute('contenteditable'));
        el.contentEditable = 'true';
      });
    } else {
      originalEditing.forEach((original, el) => {
        if (original === null) el.removeAttribute('contenteditable');
        else el.setAttribute('contenteditable', original);
      });
      originalEditing.clear();
    }
  }
  setInlineEditing(inlineEditing);
  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    if (event.data?.type === 'lp-set-inline-editing' && typeof event.data.enabled === 'boolean') {
      setInlineEditing(event.data.enabled);
      return;
    }
    if (event.data?.type !== 'lp-scroll-to-section' ||
        typeof event.data.id !== 'string') return;
    // Compare IDs directly so quotes and other selector characters are safe.
    const section = Array.from(root.querySelectorAll('[data-section-id]'))
      .find((element) => element.getAttribute('data-section-id') === event.data.id);
    if (!section) return;
    section.scrollIntoView({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest',
    });
  });
  document.addEventListener('click', (event) => {
    const section = event.target.closest('[data-section-id]');
    if (section) parent.postMessage({ type: 'lp-section-selected', id: section.dataset.sectionId }, '*');
  });
    // Autosave is debounced by the parent. Send edits immediately so switching
    // modes or changing CSS does not discard the final keystrokes.
    root.addEventListener('input', () => {
      if (!inlineEditing) return;
      const clone = root.cloneNode(true);
      const liveElements = root.querySelectorAll('*');
      const clonedElements = clone.querySelectorAll('*');
      liveElements.forEach((el, index) => {
        if (!originalEditing.has(el)) return;
        const original = originalEditing.get(el);
        if (original === null) clonedElements[index].removeAttribute('contenteditable');
        else clonedElements[index].setAttribute('contenteditable', original);
      });
      parent.postMessage({ type: 'lp-inline-update', html: clone.innerHTML }, '*');
    });
})();
</script>
</body>
</html>`;
}
