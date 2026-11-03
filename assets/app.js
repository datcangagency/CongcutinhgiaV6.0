/* Công cụ tính giá Đất Cảng. Thuần HTML/JS, không gọi máy chủ, không lưu dữ liệu của người dùng. */
(function () {
  'use strict';
  var D = window.PRICE_DATA, CFG = window.SITE_CONFIG || {};
  if (!D) { document.body.innerHTML = '<p style="padding:20px">Không tải được dữ liệu giá (assets/data.js).</p>'; return; }

  var state = { tab: D.products[0].key, pk: {}, ad: {}, mt: { on: false, months: 6 }, name: '' };
  var PK = {}, AD = {}, ORDER_PK = [], ORDER_AD = [];
  D.products.forEach(function (p) {
    p.sections.forEach(function (s) { s.packages.forEach(function (k) { PK[k.id] = k; k._p = p; ORDER_PK.push(k.id); }); });
    p.addons.forEach(function (a) { AD[a.id] = a; a._p = p; ORDER_AD.push(a.id); });
  });
  var MT = (D.products.filter(function (p) { return p.maintenance; })[0] || {}).maintenance || null;

  /* ---------- tiện ích ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function money(n) { return fmt(n) + 'đ'; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function product(key) { return D.products.filter(function (p) { return p.key === key; })[0]; }
  function priceText(k) { return (k.mode === 'Từ' ? 'Từ ' : '') + money(k.price); }

  /* ---------- logic tính ---------- */
  function eligible(a) {
    if (!a.apply) return true;
    return a.apply.some(function (id) { return state.pk[id] > 0; });
  }
  function pruneAddons() {
    Object.keys(state.ad).forEach(function (id) { if (!AD[id] || !eligible(AD[id])) delete state.ad[id]; });
  }
  function calc() {
    var lines = [], net = 0, anyFrom = false, quotes = [];
    ORDER_PK.forEach(function (id) {
      var q = state.pk[id]; if (!q) return;
      var k = PK[id], t = k.price * q;
      if (k.mode === 'Từ') anyFrom = true;
      lines.push({ kind: 'pk', id: id, name: k.name, sub: (k.mode === 'Từ' ? 'giá khởi điểm · ' : '') + q + ' × ' + money(k.price), total: t });
      net += t;
    });
    ORDER_AD.forEach(function (id) {
      var q = state.ad[id]; if (!q) return;
      var a = AD[id];
      if (a.kind === 'fixed') {
        var t = a.price * q;
        lines.push({ kind: 'ad', id: id, name: a.name, sub: q + ' × ' + money(a.price) + ' / ' + a.unit, total: t });
        net += t;
      } else if (a.kind === 'percent') {
        var base = 0;
        (a.apply || []).forEach(function (pid) { if (state.pk[pid]) base += PK[pid].price * state.pk[pid]; });
        var t2 = Math.round(base * a.pct / 1000) * 1000;
        lines.push({ kind: 'ad', id: id, name: a.name, sub: Math.round(a.pct * 100) + '% giá gói đã chọn (' + money(base) + ')', total: t2 });
        net += t2;
      } else if (a.kind === 'quote') {
        quotes.push({ id: id, name: a.name + (q > 1 ? ' × ' + q : '') });
      }
    });
    var m = 0;
    if (state.mt.on && MT) m = state.mt.months * MT.price;
    var vat = D.vat;
    function split(total) { var a = Math.round(total / 2); return [a, total - a]; }
    var p = split(net), mm = split(m);
    var pays = [];
    if (net > 0) {
      pays.push({ label: 'Dự án — đợt 1: 50% khi ký hợp đồng', net: p[0] });
      pays.push({ label: 'Dự án — đợt 2: 50% khi nghiệm thu', net: p[1] });
    }
    if (m > 0) {
      pays.push({ label: 'Bảo trì website — đợt 1: 50% đầu tháng thứ 1', net: mm[0] });
      pays.push({ label: 'Bảo trì website — đợt 2: 50% đầu tháng thứ 3', net: mm[1] });
    }
    var vatSum = 0, netSum = 0;
    pays.forEach(function (x) { x.vat = Math.round(x.net * vat); x.gross = x.net + x.vat; vatSum += x.vat; netSum += x.net; });
    return { lines: lines, quotes: quotes, net: net, maint: m, netSum: netSum, vat: vatSum, gross: netSum + vatSum, pays: pays, anyFrom: anyFrom, count: lines.length + (m > 0 ? 1 : 0) + quotes.length };
  }

  /* ---------- hiển thị: khung trang ---------- */
  function renderFrame() {
    $('#ver').textContent = 'Bảng giá ' + D.version + ' · ' + D.date + ' · Giá chưa VAT';
    $('#quick').innerHTML = D.quick.map(function (q) {
      return '<button type="button" class="chip" data-act="quick" data-tab="' + esc(q[2]) + '">' + esc(q[0]) + ' → <b>' + esc(q[1]) + '</b></button>';
    }).join('');
    $('#tabs').innerHTML = D.products.map(function (p) {
      var prices = [];
      p.sections.forEach(function (s) { s.packages.forEach(function (k) { prices.push(k.price); }); });
      var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
      return '<button type="button" class="tab" role="tab" id="tab-' + p.key + '" data-act="tab" data-tab="' + p.key + '" aria-controls="panel">' + esc(p.short) +
        '<small>' + fmt(lo / 1000) + 'k – ' + fmt(hi / 1000) + 'k</small></button>';
    }).join('');
    $('#cond').innerHTML = D.conditions.map(function (c) { return '<dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd>'; }).join('');
    var contact = (CFG.contact || []).filter(Boolean);
    $('#foot').innerHTML =
      '<p><b>' + esc(CFG.brandName || 'Đất Cảng Agency') + '</b> · Bảng giá ' + esc(D.version) + ' · ' + esc(D.date) + '</p>' +
      '<p>' + esc(D.disclaimer) + '</p>' +
      '<p>Trang này không thu thập, không lưu và không gửi thông tin bạn nhập. Video tham khảo do các đơn vị khác thực hiện, không phải sản phẩm của Đất Cảng.</p>' +
      (contact.length ? '<p>' + contact.map(esc).join(' · ') + '</p>' : '<p>Liên hệ nhân viên kinh doanh của Đất Cảng để nhận báo giá chính thức.</p>');
  }

  /* ---------- hiển thị: gói và dịch vụ thêm ---------- */
  function list(items, hlSet) {
    return '<ul>' + items.map(function (x) { return '<li' + (hlSet && hlSet.indexOf(x) >= 0 ? ' class="hl"' : '') + '>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  function det(title, inner) { return inner ? '<details><summary>' + esc(title) + '</summary>' + inner + '</details>' : ''; }
  function cardHtml(k) {
    var delta = '';
    if (k.deltaFirst) delta = '<p>' + esc(k.delta[0] || '') + '</p>';
    else delta = '<ul class="delta">' + k.delta.map(function (x) { return '<li>+ ' + esc(x) + '</li>'; }).join('') + '</ul>';
    var vids = k.videos.length ? det('Video tham khảo', '<div class="vids">' + k.videos.map(function (v, i) {
      return '<a href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">Video tham khảo ' + (i + 1) + ' ↗</a>';
    }).join('') + '<span class="vnote">' + esc(k.videoNote) + '</span></div>') : '';
    return '<article class="card" data-id="' + k.id + '">' +
      '<div class="card-h">' + esc(k.name) + '</div>' +
      '<div class="card-price">' + esc(priceText(k)) + ' <small>chưa VAT</small></div>' +
      '<div class="card-b">' +
      '<div><p class="lab">Phù hợp với</p><p>' + esc(k.fit) + '</p></div>' +
      (k.delta.length ? '<div><p class="lab">Khác gì so với gói trước</p>' + delta + '</div>' : '') +
      (k.why ? '<div><p class="lab">Vì sao khác</p><p class="why">' + esc(k.why) + '</p></div>' : '') +
      det('Bạn nhận được', list(k.scope, k.hl) + '<p class="out' + (k.hlOut ? ' hl' : '') + '">→ ' + esc(k.output) + '</p>') +
      det('Chỉnh sửa', '<p class="out">' + esc(k.revisions) + '</p>') +
      det('Bạn cần chuẩn bị', list(k.clientInput)) +
      det('Chưa bao gồm', list(k.excludes)) +
      vids +
      '</div><div class="card-f" data-foot="' + k.id + '"></div></article>';
  }
  function stepper(act, id, val, min) {
    return '<span class="qty"><button type="button" data-act="' + act + '-dec" data-id="' + id + '" aria-label="Giảm">−</button>' +
      '<input type="number" inputmode="numeric" min="' + min + '" max="99" value="' + val + '" data-act="' + act + '-set" data-id="' + id + '" aria-label="Số lượng">' +
      '<button type="button" data-act="' + act + '-inc" data-id="' + id + '" aria-label="Tăng">+</button></span>';
  }
  function renderFoots() {
    $$('[data-foot]').forEach(function (el) {
      var id = el.getAttribute('data-foot'), q = state.pk[id] || 0, card = el.parentNode;
      card.classList.toggle('on', q > 0);
      el.innerHTML = q > 0
        ? stepper('pk', id, q, 1) + '<button type="button" class="btn ghost small" data-act="pk-rm" data-id="' + id + '">Bỏ chọn</button>'
        : '<span class="hint">' + esc(priceText(PK[id])) + '</span><button type="button" class="btn small" data-act="pk-add" data-id="' + id + '">Chọn gói này</button>';
    });
  }
  function addonPriceText(a) {
    if (a.kind === 'fixed') return money(a.price) + ' / ' + a.unit;
    if (a.kind === 'percent') return Math.round(a.pct * 100) + '% giá gói';
    if (a.kind === 'quote') return 'Báo giá riêng';
    return 'Theo chi phí thực tế';
  }
  function renderAddons() {
    var p = product(state.tab), box = $('#addons');
    if (!box) return;
    box.innerHTML = p.addons.map(function (a) {
      var on = eligible(a), q = state.ad[a.id] || 0, act = '';
      if (a.kind === 'actual') act = '<span class="hint">Tính theo thực tế, Đất Cảng báo khi lập báo giá.</span>';
      else if (!on) act = '<span class="hint">Cần chọn một trong các gói: ' + esc(a.apply.map(function (i) { return PK[i].name; }).join(', ')) + '</span>';
      else if (a.kind === 'percent') act = q ? '<button type="button" class="btn ghost small" data-act="ad-rm" data-id="' + a.id + '">Bỏ</button>' : '<button type="button" class="btn small" data-act="ad-add" data-id="' + a.id + '">Thêm</button>';
      else act = q ? stepper('ad', a.id, q, 0) + '<button type="button" class="btn ghost small" data-act="ad-rm" data-id="' + a.id + '">Bỏ</button>' : '<button type="button" class="btn small" data-act="ad-add" data-id="' + a.id + '">Thêm</button>';
      var applyTxt = (a.apply && on) ? '' : '';
      return '<div class="add' + (on ? '' : ' off') + '"><div class="add-n">' + esc(a.name) + '</div><div class="add-p">' + esc(addonPriceText(a)) + '</div>' +
        '<div class="add-note">' + esc(a.note) + applyTxt + '</div><div class="add-act">' + act + '</div></div>';
    }).join('');
    var mt = $('#maint');
    if (mt && MT) {
      mt.innerHTML = state.mt.on
        ? '<span class="qty"><button type="button" data-act="mt-dec" aria-label="Giảm">−</button><input type="number" min="' + MT.minMonths + '" max="60" value="' + state.mt.months + '" data-act="mt-set" aria-label="Số tháng"><button type="button" data-act="mt-inc" aria-label="Tăng">+</button></span> <span class="hint">tháng (tối thiểu ' + MT.minMonths + ')</span> <button type="button" class="btn ghost small" data-act="mt-rm">Bỏ</button>'
        : '<button type="button" class="btn small" data-act="mt-add">Thêm bảo trì</button>';
    }
  }
  function renderPanel() {
    var p = product(state.tab);
    var html = '<p class="intro">' + esc(p.intro) + ' Giá chưa VAT.</p>';
    p.sections.forEach(function (s) {
      html += '<h2 class="sec-title">' + esc(s.label) + '</h2><div class="grid">' + s.packages.map(cardHtml).join('') + '</div>';
    });
    if (p.maintenance) {
      var m = p.maintenance;
      html += '<h2 class="sec-title">Duy trì website — bảo trì</h2><div class="add" style="border:1px solid var(--line);border-radius:10px">' +
        '<div class="add-n">' + esc(m.name) + '</div><div class="add-p">' + money(m.price) + ' / tháng</div>' +
        '<div class="add-note">' + esc(m.fit) + '. Ký tối thiểu ' + m.minMonths + ' tháng; thu 50% đầu tháng thứ 1 và 50% đầu tháng thứ 3.</div>' +
        '<div class="add-act" id="maint"></div>' +
        '<div class="add-note">' + det('Bạn nhận được', list(m.scope)) + det('Chưa bao gồm', list(m.excludes)) + '</div></div>';
    }
    if (p.addons.length) html += '<h2 class="sec-title">Dịch vụ thêm</h2><div class="addons" id="addons"></div>';
    html += '<div class="third"><p class="lab">Chi phí bên thứ ba — tính riêng, bạn duyệt trước khi chi</p><ul>' +
      p.thirdParty.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p>' + esc(p.thirdNote) + '</p></div>';
    var el = $('#panel');
    el.innerHTML = html;
    el.setAttribute('aria-labelledby', 'tab-' + p.key);
    $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === state.tab ? 'true' : 'false'); });
    renderFoots(); renderAddons();
  }

  /* ---------- tổng hợp báo giá ---------- */
  function plainQuote(r) {
    var L = ['BÁO GIÁ TẠM TÍNH — ' + (CFG.brandName || 'Đất Cảng Agency') + ' · Bảng giá ' + D.version + ' (' + D.date + ')'];
    if (state.name) L.push('Khách hàng: ' + state.name);
    L.push('');
    r.lines.forEach(function (x) { L.push('- ' + x.name + ' (' + x.sub + '): ' + money(x.total)); });
    if (r.maint > 0) L.push('- Bảo trì website (' + state.mt.months + ' × ' + money(MT.price) + '): ' + money(r.maint));
    r.quotes.forEach(function (x) { L.push('- ' + x.name + ': cần báo giá riêng'); });
    L.push('');
    L.push('Tổng chưa VAT: ' + money(r.netSum));
    L.push('VAT ' + Math.round(D.vat * 100) + '%: ' + money(r.vat));
    L.push('Tổng có VAT: ' + money(r.gross));
    if (r.pays.length) { L.push(''); L.push('Lịch thanh toán (có VAT):'); r.pays.forEach(function (x) { L.push('- ' + x.label + ': ' + money(x.gross)); }); }
    if (r.anyFrom) L.push('Lưu ý: có gói giá "từ"; giá cuối theo phạm vi sau khi trao đổi.');
    L.push('Chi phí bên thứ ba (diễn viên, địa điểm, đạo cụ, trang phục thuê riêng, in ấn, tên miền... nếu có) tính riêng theo dự toán.');
    L.push(D.disclaimer);
    return L.join('\n');
  }
  function renderSummary() {
    pruneAddons();
    var r = calc(), b = $('#sumBody');
    $('#sumCount').textContent = r.count ? '(' + r.count + ' mục)' : '';
    $('#sumBarTotal').textContent = r.count ? (r.netSum > 0 || r.maint > 0 ? money(r.gross) : 'Cần báo giá') : 'Chưa chọn';
    var h = '<h2>Báo giá tạm tính</h2>';
    if (!r.count) {
      h += '<p class="empty">Chọn một gói ở bên trái để bắt đầu. Giá, VAT và lịch thanh toán sẽ hiện ở đây.</p>';
    } else {
      h += '<table class="lines">' + r.lines.map(function (x) {
        return '<tr><td>' + esc(x.name) + '<span class="sub">' + esc(x.sub) + '</span><button type="button" class="rm" data-act="' + (x.kind === 'pk' ? 'pk-rm' : 'ad-rm') + '" data-id="' + x.id + '">Bỏ</button></td><td class="r">' + money(x.total) + '</td></tr>';
      }).join('') +
        (r.maint > 0 ? '<tr><td>Bảo trì website<span class="sub">' + state.mt.months + ' tháng × ' + money(MT.price) + '</span><button type="button" class="rm" data-act="mt-rm">Bỏ</button></td><td class="r">' + money(r.maint) + '</td></tr>' : '') +
        r.quotes.map(function (x) { return '<tr><td>' + esc(x.name) + '<span class="sub">Cần báo giá riêng, chưa tính vào tổng</span><button type="button" class="rm" data-act="ad-rm" data-id="' + x.id + '">Bỏ</button></td><td class="r">—</td></tr>'; }).join('') +
        '</table>';
      h += '<div class="tot"><div><span>Tổng chưa VAT</span><b>' + money(r.netSum) + '</b></div><div><span>VAT ' + Math.round(D.vat * 100) + '%</span><b>' + money(r.vat) + '</b></div><div class="big"><span>Tổng có VAT</span><span>' + money(r.gross) + '</span></div></div>';
      if (r.anyFrom) h += '<div class="warn">Có gói giá khởi điểm ("từ"): giá cuối được chốt theo phạm vi sau khi trao đổi.</div>';
      if (r.pays.length) {
        h += '<div class="pay"><h3>Lịch thanh toán</h3><table><tr><th>Đợt</th><th class="r">Chưa VAT</th><th class="r">Có VAT</th></tr>' +
          r.pays.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class="r">' + money(x.net) + '</td><td class="r">' + money(x.gross) + '</td></tr>'; }).join('') + '</table></div>';
      }
      h += '<p class="note">Chi phí bên thứ ba (diễn viên, địa điểm, đạo cụ, trang phục thuê riêng, in ấn, tên miền... nếu có) tính riêng theo dự toán và bạn duyệt trước khi chi.</p>';
      h += '<div class="field"><label for="cname">Tên bạn hoặc doanh nghiệp (không bắt buộc, chỉ hiện trên bản in)</label><input type="text" id="cname" maxlength="80" value="' + esc(state.name) + '"></div>';
      h += '<div class="acts"><button type="button" class="btn" data-act="print">In / Lưu PDF</button><button type="button" class="btn ghost" data-act="copy">Sao chép nội dung</button><button type="button" class="btn ghost" data-act="reset">Xóa lựa chọn</button></div><p class="note" id="copied" role="status"></p>';
    }
    h += '<p class="note">' + esc(D.disclaimer) + '</p>';
    b.innerHTML = h;
    renderPrint(r);
  }
  function renderPrint(r) {
    var contact = (CFG.contact || []).filter(Boolean);
    var h = '<h1>Báo giá tạm tính — ' + esc(CFG.brandName || 'Đất Cảng Agency') + '</h1><p class="meta">Bảng giá ' + esc(D.version) + ' · ' + esc(D.date) + (state.name ? ' · Khách hàng: ' + esc(state.name) : '') + '</p>';
    if (!r.count) { $('#printArea').innerHTML = h + '<p>Chưa chọn mục nào.</p>'; return; }
    h += '<table><tr><th>Hạng mục</th><th>Cách tính</th><th class="r">Thành tiền (chưa VAT)</th></tr>' +
      r.lines.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.sub) + '</td><td class="r">' + money(x.total) + '</td></tr>'; }).join('') +
      (r.maint > 0 ? '<tr><td>Bảo trì website</td><td>' + state.mt.months + ' tháng × ' + money(MT.price) + '</td><td class="r">' + money(r.maint) + '</td></tr>' : '') +
      r.quotes.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td>Cần báo giá riêng</td><td class="r">—</td></tr>'; }).join('') +
      '<tr><td colspan="2"><b>Tổng chưa VAT</b></td><td class="r"><b>' + money(r.netSum) + '</b></td></tr>' +
      '<tr><td colspan="2">VAT ' + Math.round(D.vat * 100) + '%</td><td class="r">' + money(r.vat) + '</td></tr>' +
      '<tr><td colspan="2"><b>Tổng có VAT</b></td><td class="r"><b>' + money(r.gross) + '</b></td></tr></table>';
    if (r.pays.length) h += '<h2>Lịch thanh toán</h2><table><tr><th>Đợt</th><th class="r">Chưa VAT</th><th class="r">Có VAT</th></tr>' +
      r.pays.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class="r">' + money(x.net) + '</td><td class="r">' + money(x.gross) + '</td></tr>'; }).join('') + '</table>';
    if (r.anyFrom) h += '<p class="warn">Có gói giá khởi điểm ("từ"): giá cuối được chốt theo phạm vi sau khi trao đổi.</p>';
    h += '<p>Chi phí bên thứ ba (diễn viên, địa điểm, đạo cụ, trang phục thuê riêng, in ấn, tên miền... nếu có) tính riêng theo dự toán; bạn duyệt trước khi chi.</p><p class="warn">' + esc(D.disclaimer) + '</p>';
    if (contact.length) h += '<p>' + contact.map(esc).join(' · ') + '</p>';
    $('#printArea').innerHTML = h;
  }

  /* ---------- thao tác ---------- */
  function setTab(key, scroll) {
    if (!product(key)) key = D.products[0].key;
    state.tab = key;
    try { history.replaceState(null, '', '#' + key); } catch (e) { }
    renderPanel();
    if (scroll) { var t = $('#tabs'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function refresh() { renderFoots(); renderAddons(); renderSummary(); }
  function copyText(txt, done) {
    function fb() { var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); done(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, fb); else fb();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) { return; }
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (t.tagName === 'INPUT') return;
    switch (act) {
      case 'tab': setTab(t.getAttribute('data-tab'), false); break;
      case 'quick': setTab(t.getAttribute('data-tab'), true); break;
      case 'pk-add': state.pk[id] = 1; refresh(); break;
      case 'pk-rm': delete state.pk[id]; refresh(); break;
      case 'pk-inc': state.pk[id] = clamp((state.pk[id] || 1) + 1, 1, 99); refresh(); break;
      case 'pk-dec': state.pk[id] = clamp((state.pk[id] || 1) - 1, 1, 99); refresh(); break;
      case 'ad-add': state.ad[id] = 1; refresh(); break;
      case 'ad-rm': delete state.ad[id]; refresh(); break;
      case 'ad-inc': state.ad[id] = clamp((state.ad[id] || 1) + 1, 1, 99); refresh(); break;
      case 'ad-dec': var v = (state.ad[id] || 1) - 1; if (v < 1) delete state.ad[id]; else state.ad[id] = v; refresh(); break;
      case 'mt-add': state.mt.on = true; state.mt.months = MT.minMonths; refresh(); break;
      case 'mt-rm': state.mt.on = false; refresh(); break;
      case 'mt-inc': state.mt.months = clamp(state.mt.months + 1, MT.minMonths, 60); refresh(); break;
      case 'mt-dec': state.mt.months = clamp(state.mt.months - 1, MT.minMonths, 60); refresh(); break;
      case 'reset': state.pk = {}; state.ad = {}; state.mt = { on: false, months: MT ? MT.minMonths : 6 }; refresh(); break;
      case 'print': window.print(); break;
      case 'copy': copyText(plainQuote(calc()), function (ok) { var c = $('#copied'); if (c) c.textContent = ok ? 'Đã sao chép nội dung báo giá.' : 'Không sao chép được; hãy chọn và sao chép thủ công.'; }); break;
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t.getAttribute) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'pk-set') { state.pk[id] = clamp(t.value, 1, 99); refresh(); }
    else if (act === 'ad-set') { var v = clamp(t.value, 0, 99); if (v < 1) delete state.ad[id]; else state.ad[id] = v; refresh(); }
    else if (act === 'mt-set') { state.mt.months = clamp(t.value, MT.minMonths, 60); refresh(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'cname') { state.name = e.target.value; renderPrint(calc()); }
  });
  $('#sumBar').addEventListener('click', function () {
    var s = $('#summary'), open = !s.classList.contains('open');
    s.classList.toggle('open', open); this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', function () { var k = location.hash.replace('#', ''); if (product(k) && k !== state.tab) setTab(k, false); });

  renderFrame();
  var h0 = location.hash.replace('#', '');
  setTab(product(h0) ? h0 : D.products[0].key, false);
  renderSummary();
})();
