/* ===== ショートハンド ===== */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

/* ===== マウス位置でCSS変数更新（スポットライト・パララックス） ===== */
(function mouseVars(){
  const root = document.documentElement;
  let raf = 0, mx = .5, my = .5, tx = .5, ty = .5;

  const onMove = e => {
    const x = e.clientX / innerWidth;
    const y = e.clientY / innerHeight;
    tx = Math.max(0, Math.min(1, x));
    ty = Math.max(0, Math.min(1, y));
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const tick = () => {
    mx += (tx - mx) * 0.12;
    my += (ty - my) * 0.12;
    root.style.setProperty('--mx', mx.toFixed(4));
    root.style.setProperty('--my', my.toFixed(4));

    // オーブの軽い追従
    const o1 = $('.orb-1'), o2 = $('.orb-2');
    if (o1) o1.style.transform = `translate(${(mx-.5)*30}px, ${(my-.5)*20}px)`;
    if (o2) o2.style.transform = `translate(${(mx-.5)*-32}px, ${(my-.5)*-18}px)`;

    raf = 0;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
})();

/* ===== ENTERボタンのマグネット効果 ===== */
(function magnetEnter(){
  if (document.documentElement.dataset.page !== 'landing') return;
  const btn = $('#enterBtn');
  if (!btn) return;

  let rect = null, anim = 0, dx = 0, dy = 0, tx = 0, ty = 0;

  const updateRect = () => rect = btn.getBoundingClientRect();
  updateRect();
  window.addEventListener('resize', updateRect);

  const onMove = e => {
    if (!rect) return;
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const distX = e.clientX - cx;
    const distY = e.clientY - cy;
    const dist = Math.hypot(distX, distY);
    const power = Math.max(0, 1 - dist / 260); // 近いほど強く
    tx = distX * 0.25 * power;
    ty = distY * 0.25 * power;
    if (!anim) anim = requestAnimationFrame(tick);
  };
  const tick = () => {
    dx += (tx - dx) * 0.15;
    dy += (ty - dy) * 0.15;
    btn.style.transform = `translate(${dx}px, ${dy}px)`;
    anim = 0;
  };

  window.addEventListener('pointermove', onMove, { passive: true });

  // クリックで遷移
  btn.addEventListener('click', () => {
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = 'hub.html'; }, 120);
  });

  // Enterキーで遷移
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') btn.click();
  });

  // クリック波紋
  btn.addEventListener('pointerdown', e => {
    const r = document.createElement('span');
    r.className = 'ripple';
    const b = btn.getBoundingClientRect();
    r.style.left = `${e.clientX - b.left}px`;
    r.style.top = `${e.clientY - b.top}px`;
    btn.appendChild(r);
    setTimeout(() => r.remove(), 600);
  });

  // 波紋CSSを注入
  const s = document.createElement('style');
  s.textContent = `
    .btn { position: relative; overflow: hidden; }
    .ripple{
      position:absolute;width:12px;height:12px;background:rgba(255,255,255,.6);
      border-radius:50%;transform:translate(-50%,-50%) scale(0);
      animation:ripple 600ms ease-out forwards;pointer-events:none;mix-blend-mode:screen;filter:blur(.5px);
    }
    @keyframes ripple{ to{ transform:translate(-50%,-50%) scale(18); opacity:0; } }
    body.leaving .hero-inner{ opacity:.6; transform:scale(.995); transition:transform .12s ease, opacity .12s ease; }
  `;
  document.head.appendChild(s);
})();

/* ===== 花火エンジン（キャンバス） ===== */
(function fireworks(){
  if (document.documentElement.dataset.page !== 'landing') return;

  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = $('#fx');
  const ctx = canvas.getContext('2d', { alpha: true });

  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let w = 0, h = 0, raf = 0;

  const resize = () => {
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = '100vw'; canvas.style.height = '100vh';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // パーティクル
  const rockets = [];
  const sparks = [];
  const rand = (min, max) => Math.random() * (max - min) + min;
  const hue = () => rand(0, 360);

  function launch(x, y, auto = false){
    rockets.push({
      x, y: h, vx: rand(-0.6, 0.6), vy: rand(-10.5, -8.0),
      color: `hsl(${hue()}, 100%, 60%)`, fuse: rand(0.6, 1.1), t: 0, auto
    });
  }
  function explode(x, y, baseColor){
    const n = 80;
    for (let i=0; i<n; i++){
      const a = (i/n) * Math.PI * 2;
      const spd = rand(2, 6);
      sparks.push({
        x, y,
        vx: Math.cos(a) * spd + rand(-0.6,0.6),
        vy: Math.sin(a) * spd + rand(-0.6,0.6),
        life: rand(0.8,1.6), t: 0,
        color: baseColor.replace('60%', `${rand(55,70)}%`)
      });
    }
  }

  // 自動打ち上げ（控えめ）
  let autoTimer = 0;
  function tick(ts){
    raf = requestAnimationFrame(tick);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.globalCompositeOperation = 'lighter';

    // ロケット更新
    for (let i=rockets.length-1; i>=0; i--){
      const r = rockets[i];
      r.t += 1/60;
      r.x += r.vx * dpr;
      r.y += r.vy * dpr;
      r.vy += 0.12 * dpr; // 重力
      // ロケット描画
      ctx.beginPath();
      ctx.fillStyle = r.color;
      ctx.arc(r.x/dpr, r.y/dpr, 2, 0, Math.PI*2);
      ctx.fill();

      if (r.t > r.fuse || r.vy > -1){
        explode(r.x, r.y, r.color);
        rockets.splice(i,1);
      }
    }

    // スパーク更新
    for (let i=sparks.length-1; i>=0; i--){
      const p = sparks[i];
      p.t += 1/60;
      const k = p.t / p.life;
      p.x += p.vx * dpr;
      p.y += p.vy * dpr;
      p.vy += 0.06 * dpr;
      const alpha = Math.max(0, 1 - k);
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.pow(alpha, 1.5);
      ctx.arc(p.x/dpr, p.y/dpr, Math.max(0.5, 2 * alpha), 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 軌跡
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.2 * alpha;
      ctx.beginPath();
      ctx.moveTo(p.x/dpr, p.y/dpr);
      ctx.lineTo((p.x - p.vx*6)/dpr, (p.y - p.vy*6)/dpr);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (k >= 1) sparks.splice(i,1);
    }

    // 自動（reduce motion なら停止）
    if (!prefersReduce){
      autoTimer -= 1/60;
      if (autoTimer <= 0){
        autoTimer = rand(0.8, 1.6);
        launch(rand(w*0.2, w*0.8), rand(h*0.25, h*0.45), true);
      }
    }
  }
  raf = requestAnimationFrame(tick);

  // クリック or タップで好きな位置に打ち上げ
  const toCanvas = e => {
    const x = (e.clientX ?? (e.touches?.[0]?.clientX || innerWidth/2)) * dpr;
    const y = (e.clientY ?? (e.touches?.[0]?.clientY || innerHeight/2)) * dpr;
    return { x, y };
  };
  const onFire = e => {
    const { x } = toCanvas(e);
    launch(x, h*0.98);
  };
  window.addEventListener('pointerdown', onFire);

  // メモリ解放
  window.addEventListener('pagehide', () => cancelAnimationFrame(raf));
})();

/* ===== Hub 検索（既存） ===== */
(function initHub(){
  if (document.documentElement.dataset.page !== 'hub') return;
  const search = $('#hubSearch');
  // すべてのカテゴリ内カードを対象に
  const cards = $$('section.cards .card'); // または単に $$('article.card')
  const norm = s => (s||'').toLowerCase();
  const filter = () => {
    const q = norm(search.value);
    cards.forEach(c => {
      const t = norm($('.card-title', c)?.textContent);
      const d = norm($('.card-desc', c)?.textContent);
      const g = norm(c.dataset.tags);
      c.style.display = (t.includes(q)||d.includes(q)||g.includes(q)) ? '' : 'none';
    });
  };
  search?.addEventListener('input', filter);
  if (location.hash){ search.value = decodeURIComponent(location.hash.slice(1)); filter(); }
})();
