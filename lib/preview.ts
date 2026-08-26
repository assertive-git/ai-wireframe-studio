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
    root.querySelectorAll('h1,h2,h3,h4,p,li,a,button,span').forEach((el) => {
      if (el.closest('[data-no-inline-edit]')) return;
      el.contentEditable = 'true';
      el.style.outline = 'none';
    });
    let timer;
    root.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => parent.postMessage({ type: 'lp-inline-update', html: root.innerHTML }, '*'), 350);
    });
  }
})();
</script>
</body>
</html>`;
}
