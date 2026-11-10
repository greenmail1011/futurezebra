// 未來斑馬改版預覽：共用互動（手機選單、捲動淡入、燈箱、複製帳號）
(function () {
  // 手機選單
  var nav = document.querySelector('.gnav');
  var tg = document.querySelector('.gnav-toggle');
  if (nav && tg) {
    tg.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      tg.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('.gnav-links a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); tg.setAttribute('aria-expanded', 'false'); });
    });
  }

  // 捲動淡入
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); });
  }

  // 燈箱
  var lb = document.getElementById('lightbox');
  if (lb) {
    var li = document.getElementById('lightbox-img'), lc = document.getElementById('lightbox-cap');
    document.querySelectorAll('.zoom').forEach(function (img) {
      img.addEventListener('click', function (e) {
        e.preventDefault();
        li.src = img.currentSrc || img.src; li.alt = img.alt;
        lc.textContent = img.dataset.cap || img.alt || '';
        lb.style.display = 'flex'; document.body.style.overflow = 'hidden';
      });
    });
    var close = function () { lb.style.display = 'none'; document.body.style.overflow = ''; };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // 複製匯款帳號
  var cb = document.getElementById('copy-acct'), cm = document.getElementById('copy-acct-msg');
  if (cb) cb.addEventListener('click', function () {
    var v = cb.dataset.acct;
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { cm.textContent = '已複製帳號 ' + v; }, function () { cm.textContent = '請手動複製：' + v; });
    else cm.textContent = '請手動複製：' + v;
  });
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { var t = document.getElementById(b.dataset.open); if (t) t.click(); });
  });
})();
