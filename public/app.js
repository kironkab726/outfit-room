// 옷방 화면
//   1) 내 사진 올리기 → 피팅룸(왼쪽)에 표시
//   2) 상황·성별·예산·느낌(+ 찾아 둔 옷) 입력 → /api/recommend 로 코디 3개 추천
//   3) 코디 아이템마다 /api/shop 으로 실제 상품 검색 → 사진·가격·구매 링크
//   4) 상품의 "입혀 보기" → /api/tryon 으로 지금 사진 위에 입힘 (상의·하의를 차례로 겹쳐 입기 가능)

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CATEGORY_LABEL = { outer: '아우터', top: '상의', bottom: '하의', dress: '원피스', shoes: '신발', bag: '가방', accessory: '소품' };
  // 가상 피팅이 되는 종류 → 피팅 모델의 category
  const TRYON_CATEGORY = { outer: 'tops', top: 'tops', bottom: 'bottoms', dress: 'one-pieces' };
  const TRYON_LABEL = { tops: '상의', bottoms: '하의', 'one-pieces': '원피스' };
  // 예산을 아이템 하나에 얼마까지 쓸지 (대략)
  const BUDGET_SHARE = { outer: 0.45, top: 0.25, bottom: 0.3, dress: 0.6, shoes: 0.3, bag: 0.3, accessory: 0.15 };

  const state = {
    original: null,   // 처음 올린 내 사진 (data URL)
    current: null,    // 지금 피팅룸에 보이는 사진 (data URL 또는 https 주소)
    worn: {},         // { tops: {title, link}, bottoms: ..., 'one-pieces': ... }
    candidates: [],   // [{ image, note }]
    result: null,
    lookIndex: 0,
    busy: false,
  };
  const shopCache = new Map();

  // ── 저장소 (입장 코드 기억용, 실패해도 상관없음) ─────────────
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
  };

  // ── 사진 줄이기: 큰 사진을 1280px 이하 JPEG 로 ─────────────
  function resizeImage(file, maxSide = 1280) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 열지 못했어요.')); };
      img.src = url;
    });
  }

  // ── API 호출 ─────────────────────────────────────────────
  async function api(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const code = $('access-code').value.trim();
    if (code) headers['X-Access-Code'] = code;
    const res = await fetch(path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    let data = {};
    try { data = await res.json(); } catch { /* 빈 응답 */ }
    if (res.status === 401) {
      $('code-row').hidden = false;
      $('access-code').focus();
    }
    if (!res.ok && !data.items) throw new Error(data.error || `요청이 실패했어요 (${res.status})`);
    return data;
  }

  const won = n => `${n.toLocaleString('ko-KR')}원`;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ── 피팅룸 ───────────────────────────────────────────────
  function renderMirror() {
    const has = !!state.current;
    $('mirror-img').hidden = !has;
    $('mirror-empty').hidden = has;
    if (has) $('mirror-img').src = state.current;
    $('reset-btn').disabled = !has || state.current === state.original;

    const save = $('save-btn');
    if (has) {
      save.href = state.current;
      save.removeAttribute('aria-disabled');
      // 다른 사이트 주소는 download 가 안 먹으므로 새 탭으로 열기
      if (state.current.startsWith('data:')) save.removeAttribute('target');
      else save.target = '_blank';
    } else {
      save.removeAttribute('href');
      save.setAttribute('aria-disabled', 'true');
    }

    const list = $('worn-list');
    list.replaceChildren();
    for (const [cat, w] of Object.entries(state.worn)) {
      const li = el('li');
      li.append(el('span', 'tag', TRYON_LABEL[cat]));
      if (w.link) {
        const a = el('a', null, w.title);
        a.href = w.link; a.target = '_blank'; a.rel = 'noopener';
        li.append(a);
      } else {
        li.append(el('span', null, w.title));
      }
      list.append(li);
    }
    $('worn').hidden = !Object.keys(state.worn).length;
  }

  function setBusy(on, text) {
    state.busy = on;
    $('mirror-busy').hidden = !on;
    if (text) $('busy-text').textContent = text;
    document.querySelectorAll('[data-wear]').forEach(b => { b.disabled = on; });
  }

  $('photo-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state.original = state.current = await resizeImage(file);
      state.worn = {};
      renderMirror();
    } catch (err) {
      alert(err.message);
    }
  });

  $('reset-btn').addEventListener('click', () => {
    state.current = state.original;
    state.worn = {};
    renderMirror();
  });

  // garment: 옷 사진, category: tops|bottoms|one-pieces, info: {title, link}
  async function wear(garment, category, info) {
    if (state.busy) return false;
    if (!state.current) {
      alert('먼저 왼쪽에 내 사진을 올려 주세요.');
      $('photo-input').click();
      return false;
    }
    setBusy(true, `${TRYON_LABEL[category] || '옷'} 입혀 보는 중… (10~30초)`);
    if (window.matchMedia('(max-width: 860px)').matches) $('mirror').scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      const data = await api('/api/tryon', { person: state.current, garment, category });
      if (data.demo) {
        if (!state.demoWarned) alert('데모 모드예요. 서버에 FAL_KEY 를 넣으면 실제로 옷이 입혀져요. (지금은 입은 옷 목록만 바뀌어요)');
        state.demoWarned = true;
      } else {
        state.current = data.image;
      }
      if (category === 'one-pieces') { delete state.worn.tops; delete state.worn.bottoms; }
      else delete state.worn['one-pieces'];
      state.worn[category] = info;
      renderMirror();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── 입력 폼 ──────────────────────────────────────────────
  $('situation-chips').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    const box = $('situation');
    box.value = box.value.trim() ? `${e.target.textContent}. ${box.value.trim()}` : e.target.textContent;
    box.focus();
  });

  $('style-chips').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    e.target.classList.toggle('on');
    e.target.setAttribute('aria-pressed', e.target.classList.contains('on'));
  });

  // 찾아 둔 옷 후보
  function renderCandidates() {
    const list = $('cand-list');
    list.replaceChildren();
    state.candidates.forEach((c, i) => {
      const li = el('li');
      const img = el('img');
      img.src = c.image; img.alt = `후보 ${i + 1}`;
      const body = el('div', 'cand-body');
      body.append(el('strong', null, `후보 ${i + 1}`));
      const note = el('input');
      note.placeholder = '메모 (예: 무신사 4만 원 셔츠)';
      note.value = c.note;
      note.maxLength = 100;
      note.addEventListener('input', () => { c.note = note.value; });
      body.append(note);

      const actions = el('div', 'cand-actions');
      const select = el('select');
      for (const [v, t] of Object.entries(TRYON_LABEL)) select.append(new Option(t, v));
      const wearBtn = el('button', 'btn small', '입혀 보기');
      wearBtn.type = 'button';
      wearBtn.dataset.wear = '';
      wearBtn.addEventListener('click', () => wear(c.image, select.value, { title: c.note || `후보 ${i + 1}` }));
      const del = el('button', 'btn ghost small', '빼기');
      del.type = 'button';
      del.addEventListener('click', () => { state.candidates.splice(i, 1); renderCandidates(); });
      actions.append(select, wearBtn, del);
      body.append(actions);

      li.append(img, body);
      list.append(li);
    });
  }

  function addCandidate(image) {
    if (state.candidates.length >= 4) { alert('후보는 4개까지 올릴 수 있어요.'); return; }
    state.candidates.push({ image, note: '' });
    renderCandidates();
  }

  $('cand-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) addCandidate(await resizeImage(file, 1024));
  });

  $('cand-url-btn').addEventListener('click', () => {
    const input = $('cand-url');
    const v = input.value.trim();
    if (!/^https:\/\/.+/.test(v)) { alert('https:// 로 시작하는 이미지 주소를 넣어 주세요.'); return; }
    addCandidate(v);
    input.value = '';
  });

  // 입장 코드 기억
  $('access-code').value = store.get('accessCode') || '';
  if ($('access-code').value) $('code-row').hidden = false;
  $('access-code').addEventListener('change', e => store.set('accessCode', e.target.value.trim()));

  $('ask-form').addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('ask-status');
    const btn = $('ask-btn');
    btn.disabled = true;
    status.className = 'status';
    status.textContent = state.original ? '사진과 상황을 보고 코디를 고르는 중이에요… (20초쯤 걸려요)' : '상황을 보고 코디를 고르는 중이에요…';
    try {
      const data = await api('/api/recommend', {
        photo: state.original,
        situation: $('situation').value,
        gender: $('gender').value,
        budget: $('budget').value ? won(Number($('budget').value)) : '',
        styles: [...document.querySelectorAll('#style-chips .on')].map(b => b.textContent),
        candidates: state.candidates,
      });
      state.result = data;
      state.lookIndex = 0;
      status.textContent = data.demo ? '데모 모드: 서버에 ANTHROPIC_API_KEY 를 넣으면 내 사진에 맞춘 추천이 나와요.' : '';
      renderResult();
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      status.className = 'status error';
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ── 결과 ─────────────────────────────────────────────────
  function renderResult() {
    const r = state.result;
    $('results').hidden = false;

    const summary = $('summary');
    summary.replaceChildren(el('span', 'dress-code', r.dressCode), el('p', null, r.summary));

    const verdicts = $('cand-verdicts');
    verdicts.replaceChildren();
    if (r.candidates && r.candidates.length) {
      verdicts.append(el('h3', null, '찾아 둔 옷 평가'));
      const ul = el('ul');
      for (const c of r.candidates) {
        const cand = state.candidates[c.index - 1];
        const li = el('li');
        if (cand) { const img = el('img'); img.src = cand.image; img.alt = ''; li.append(img); }
        const body = el('div');
        body.append(el('span', `verdict v-${c.verdict}`, c.verdict), el('strong', null, ` 후보 ${c.index}`), el('p', null, c.comment));
        li.append(body);
        ul.append(li);
      }
      verdicts.append(ul);
    }
    verdicts.hidden = !verdicts.childElementCount;

    const tabs = $('look-tabs');
    tabs.replaceChildren();
    r.looks.forEach((look, i) => {
      const b = el('button', null, `${i + 1}. ${look.name}`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === state.lookIndex);
      b.addEventListener('click', () => { state.lookIndex = i; renderResult(); });
      tabs.append(b);
    });

    renderLook(r.looks[state.lookIndex]);

    const avoid = $('avoid');
    avoid.replaceChildren(el('h3', null, '이건 피해요'));
    const ul = el('ul');
    for (const a of r.avoid || []) ul.append(el('li', null, a));
    avoid.append(ul);
  }

  function renderLook(look) {
    const box = $('look');
    box.replaceChildren();

    const head = el('div', 'card look-head');
    head.append(el('h3', null, look.name), el('p', 'concept', look.concept), el('p', null, look.why));
    if (look.tips && look.tips.length) {
      const ul = el('ul', 'tips');
      for (const t of look.tips) ul.append(el('li', null, t));
      head.append(ul);
    }
    const wearAll = el('button', 'btn primary', '이 코디 통째로 입혀 보기');
    wearAll.type = 'button';
    wearAll.dataset.wear = '';
    wearAll.addEventListener('click', () => wearLook(look));
    head.append(wearAll);
    box.append(head);

    const budget = Number($('budget').value) || 0;
    for (const item of look.items) {
      const node = document.getElementById('item-tpl').content.firstElementChild.cloneNode(true);
      node.querySelector('.tag').textContent = CATEGORY_LABEL[item.category] || item.category;
      node.querySelector('h4').textContent = `${item.name}${item.color && !item.name.includes(item.color) ? ` · ${item.color}` : ''}`;
      box.append(node);
      const max = budget ? Math.round(budget * (BUDGET_SHARE[item.category] || 0.3)) : 0;
      loadProducts(item, max, node);
    }
  }

  async function searchShop(query, max) {
    const key = `${query}|${max}`;
    if (!shopCache.has(key)) {
      const p = api(`/api/shop?q=${encodeURIComponent(query)}${max ? `&max=${max}` : ''}`).catch(err => {
        shopCache.delete(key);
        throw err;
      });
      shopCache.set(key, p);
    }
    return shopCache.get(key);
  }

  async function loadProducts(item, max, node) {
    const products = node.querySelector('.products');
    const more = node.querySelector('.more-links');
    let data;
    try {
      data = await searchShop(item.query, max);
    } catch (err) {
      products.replaceChildren(el('p', 'loading', err.message));
      return;
    }
    item.products = data.items || [];

    products.replaceChildren();
    if (!item.products.length) {
      products.append(el('p', 'loading', data.demo
        ? '데모 모드: 서버에 ANTHROPIC_API_KEY 를 넣으면 실제 상품이 여기 떠요. 아래 쇼핑몰에서 바로 찾아볼 수 있어요.'
        : '맞는 상품을 못 찾았어요. 아래 쇼핑몰에서 찾아보세요.'));
    }
    const tryCat = TRYON_CATEGORY[item.category];
    for (const p of item.products) {
      const card = el('div', 'product');
      let img;
      if (p.image) {
        img = el('img');
        img.src = p.image; img.alt = p.title; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => img.replaceWith(el('div', 'no-image', '사진은 쇼핑몰에서 확인'));
      } else {
        img = el('div', 'no-image', '사진은 쇼핑몰에서 확인');
      }
      const info = el('div', 'p-info');
      info.append(
        el('p', 'p-title', p.title),
        p.price ? el('p', 'p-price', `${won(p.price)}~`) : el('p', 'p-mall', '가격은 사이트에서 확인'),
        el('p', 'p-mall', p.mall),
      );
      const actions = el('div', 'p-actions');
      if (tryCat && p.image) {
        const b = el('button', 'btn small', '입혀 보기');
        b.type = 'button';
        b.dataset.wear = '';
        b.disabled = state.busy;
        b.addEventListener('click', () => wear(p.image, tryCat, { title: p.title, link: p.link }));
        actions.append(b);
      }
      const buy = el('a', 'btn small buy', '사러 가기');
      buy.href = p.link; buy.target = '_blank'; buy.rel = 'noopener';
      actions.append(buy);
      card.append(img, info, actions);
      products.append(card);
    }

    if (item.products.some(p => p.price)) products.append(el('p', 'loading price-note', '가격은 검색 시점 기준이라 실제와 다를 수 있어요.'));
    more.replaceChildren(el('span', null, '더 찾아보기'));
    for (const l of data.links || []) {
      const a = el('a', null, l.name);
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
      more.append(a);
    }
  }

  // 코디 한 벌을 차례로 입힘: 원피스가 있으면 원피스, 아니면 하의 → 상의(아우터가 있으면 아우터)
  async function wearLook(look) {
    const withImage = i => i.products && i.products.find(p => p.image);
    const pick = cat => look.items.find(i => i.category === cat && withImage(i));
    const dress = pick('dress');
    const steps = dress
      ? [[dress, 'one-pieces']]
      : [[pick('bottom'), 'bottoms'], [pick('outer') || pick('top'), 'tops']].filter(s => s[0]);
    if (!steps.length) { alert('입혀 볼 상품 사진이 아직 없어요. 상품 검색이 끝난 뒤 다시 눌러 주세요. (데모 모드에서는 상품이 나오지 않아요)'); return; }
    for (const [item, cat] of steps) {
      const p = withImage(item);
      const ok = await wear(p.image, cat, { title: p.title, link: p.link });
      if (!ok) break;
    }
  }

  renderMirror();
})();
