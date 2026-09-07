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
${inlineEditing ? '#lp-root [contenteditable="true"]{outline:none}' : ""}
</style>
</head>
<body>
<div id="lp-root">${html}</div>
<script>
(() => {
  const inlineEditing = ${editing};
  const root = document.getElementById('lp-root');
  document.addEventListener('click', (event) => {
    const section = event.target.closest('[data-section-id]');
    if (section) parent.postMessage({ type: 'lp-section-selected', id: section.dataset.sectionId }, '*');
  });
  if (inlineEditing) {
    const originalEditing = new WeakMap();
    root.querySelectorAll('h1,h2,h3,h4,p,li,a,button,span').forEach((el) => {
      if (el.closest('[data-no-inline-edit]')) return;
      originalEditing.set(el, el.getAttribute('contenteditable'));
      el.contentEditable = 'true';
    });
    // Autosave is debounced by the parent. Send edits immediately so switching
    // modes or changing CSS does not discard the final keystrokes.
    root.addEventListener('input', () => {
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
  }
})();
</script>
</body>
</html>`;
}
