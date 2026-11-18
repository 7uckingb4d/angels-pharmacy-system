/* Presentation-only enhancements: header shadow on scroll and gentle
   reveal-on-scroll for content cards. No data, auth or API logic. */
(function () {
  var nav = document.querySelector('.site-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var targets = document.querySelectorAll('main.wrap > .card, main.wrap > .contact-cta, main.wrap > div > div > .card, main.wrap > div > .card');
  if (!targets.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('ap-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight) return; // already visible: leave as is
    el.classList.add('ap-reveal');
    io.observe(el);
  });
})();

/* Phones: the top bar only has room for one button, so the "Log In" link is
   also offered inside the ☰ menu. Mirrors whatever the page puts in the bar. */
(function () {
  var nav = document.querySelector('.site-nav .nav-container');
  var menu = document.getElementById('nav-menu');
  if (!nav || !menu) return;
  var bar = nav.querySelector('#nav-auth') || nav.querySelector(':scope > div:last-child');
  if (!bar) return;
  bar.classList.add('nav-actions');
  function sync() {
    var old = menu.querySelector('.nav-m-login');
    if (old) old.remove();
    var ghost = bar.querySelector('.btn-ghost:not(#logout-btn)');
    if (!ghost) return;
    var li = document.createElement('li');
    li.className = 'nav-m-login';
    var a = document.createElement('a');
    a.href = ghost.getAttribute('href') || '#';
    a.textContent = (ghost.textContent || 'Log In').trim();
    a.addEventListener('click', function (e) {
      if (ghost.getAttribute('onclick')) { e.preventDefault(); menu.hidden = true; ghost.click(); }
    });
    li.appendChild(a);
    menu.appendChild(li);
  }
  sync();
  new MutationObserver(sync).observe(bar, { childList: true });
})();

/* Phones: admin tables turn into stacked cards; each cell gets its column
   name from the table header so the label can be shown next to the value. */
(function () {
  var tables = document.querySelectorAll('.admin-table');
  if (!tables.length) return;
  function label(table) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) {
        if (td.tagName === 'TD' && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || '');
        if (td.hasAttribute('colspan')) td.classList.add('cell-full');
      });
    });
  }
  tables.forEach(function (t) {
    label(t);
    var body = t.querySelector('tbody');
    if (body) new MutationObserver(function () { label(t); }).observe(body, { childList: true });
  });
})();

/* Public pages: fill in pharmacy details saved in Admin → Settings. */
(function () {
  var nodes = document.querySelectorAll('[data-setting], [data-setting-mailto]');
  if (!nodes.length || !window.fetch) return;
  fetch('/api/settings', { headers: { Accept: 'application/json' } })
    .then(function (r) { return (r.headers.get('content-type') || '').indexOf('json') > -1 ? r.json() : null; })
    .then(function (s) {
      if (!s) return;
      document.querySelectorAll('[data-setting]').forEach(function (el) {
        var v = s[el.getAttribute('data-setting')];
        if (v !== undefined && v !== null && v !== '') el.textContent = v;
      });
      document.querySelectorAll('[data-setting-mailto]').forEach(function (el) {
        var v = s[el.getAttribute('data-setting-mailto')];
        if (v) el.setAttribute('href', 'mailto:' + v);
      });
    })
    .catch(function () { /* keep the built-in text */ });
})();
