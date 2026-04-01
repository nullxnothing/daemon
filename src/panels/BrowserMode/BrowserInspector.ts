export const INSPECTOR_INJECT_SCRIPT = `
(function() {
  if (document.getElementById('__daemon_inspector_overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = '__daemon_inspector_overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #4a8c62;background:rgba(74,140,98,0.08);z-index:99999;display:none;transition:all 0.05s ease;';
  document.body.appendChild(overlay);

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';

    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let segment = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          segment += ':nth-child(' + idx + ')';
        }
      }
      const cls = Array.from(current.classList).filter(c => !c.startsWith('__daemon')).slice(0, 2);
      if (cls.length > 0) segment += '.' + cls.map(c => CSS.escape(c)).join('.');
      parts.unshift(segment);
      current = parent;
    }
    return parts.join(' > ');
  }

  function onMouseMove(e) {
    const target = e.target;
    if (!target || target === overlay) return;
    const rect = target.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  function onClick(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (!target || target === overlay) return;
    const rect = target.getBoundingClientRect();
    const selector = getSelector(target);
    const text = (target.textContent || '').trim().slice(0, 200);
    const computed = window.getComputedStyle(target);
    console.log('DAEMON_INSPECT:' + JSON.stringify({
      selector: selector,
      tagName: target.tagName.toLowerCase(),
      text: text,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: {
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        display: computed.display,
        position: computed.position,
        padding: computed.padding,
        margin: computed.margin,
        width: computed.width,
        height: computed.height,
      },
      attributes: Object.fromEntries(
        Array.from(target.attributes).slice(0, 10).map(function(a) { return [a.name, a.value.slice(0, 100)] })
      ),
    }));
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  window.__daemon_inspector_cleanup = function() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    overlay.remove();
    delete window.__daemon_inspector_cleanup;
  };
})();
`

export const INSPECTOR_REMOVE_SCRIPT = `
(function() {
  if (typeof window.__daemon_inspector_cleanup === 'function') {
    window.__daemon_inspector_cleanup();
  }
  var el = document.getElementById('__daemon_inspector_overlay');
  if (el) el.remove();
})();
`
