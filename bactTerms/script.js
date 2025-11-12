/* =============================
  用語CSV → ボタン列 → モーダル詳細
  - terms.csv を自動読み込み（失敗時は手動選択）
  - ソート: A–Z / 五十音（かな） + 昇降順
  - 絞り込み: 全フィールド横断の部分一致
================================ */

const state = {
  rows: [],          // [{...}] CSV行オブジェクト
  view: [],          // 表示用配列（フィルタ＆ソート後）
  headers: [],       // CSVヘッダ配列
  keyTitle: null,    // ボタンに表示する見出しキー
  keyYomi: null,     // 50音ソート用キー（かな）
  keyEn: null,       // A–Zソートで優先する英語キー
  keyBody: null,     // 詳細本文で先に出す説明キー
};

const els = {
  buttonsWrap: document.getElementById("buttonsWrap"),
  searchInput: document.getElementById("searchInput"),
  sortDesc: document.getElementById("sortDesc"),
  sortModeRadios: document.querySelectorAll('input[name="sortMode"]'),
  meta: document.getElementById("meta"),
  filePicker: document.getElementById("filePicker"),
  reloadBtn: document.getElementById("reloadBtn"),
  modal: document.getElementById("detailModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
  modalOk: document.getElementById("modalOk"),
};

// ---------- CSV 読み込み ----------
window.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  try {
    const text = await fetchText("terms.csv");
    await loadCSVText(text);
  } catch (e) {
    info(`自動読込に失敗：${e.message}（手動でCSVを選んでください）`);
  }
});

function bindUI() {
  els.searchInput.addEventListener("input", render);
  els.sortDesc.addEventListener("change", render);
  els.sortModeRadios.forEach(r => r.addEventListener("change", render));
  els.reloadBtn.addEventListener("click", async () => {
    try {
      const text = await fetchText("terms.csv", /* bust */ true);
      await loadCSVText(text);
    } catch (e) {
      alert("terms.csv の再読込に失敗しました。ファイル選択で読み込んでください。");
    }
  });
  els.filePicker.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await loadCSVText(text);
  });

  // モーダル操作
  els.modalClose.addEventListener("click", () => els.modal.close());
  els.modalOk.addEventListener("click", () => els.modal.close());
  els.modal.addEventListener("close", () => {
    els.modalBody.replaceChildren(); // クリーンアップ
  });
}

async function fetchText(path, bust = false) {
  const url = bust ? `${path}?v=${Date.now()}` : path;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

// ---------- CSV パース & 初期化 ----------
async function loadCSVText(text) {
  const { headers, rows } = parseCSV(text);
  state.rows = rows;
  state.headers = headers;
  chooseKeys();
  render(true);
  info(`読み込み: ${rows.length}件 / ヘッダ: ${headers.join(", ")}`);
}

// RFC4180 準拠の簡易CSVパーサ（ダブルクォート対応）
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } // エスケープ
          else { inQ = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map((ln) => {
    const cells = parseLine(ln);
    const obj = {};
    header.forEach((h, idx) => obj[h] = (cells[idx] ?? "").trim());
    return obj;
  });
  return { headers: header, rows };
}

// キー選抜（ヘッダ名の違いにロバスト）
function chooseKeys() {
  const H = new Set(state.headers.map(h => h.toLowerCase()));

  const pick = (cands) => cands.find(k => H.has(k)) || null;

  state.keyTitle = pick(["term", "用語", "見出し", "title", "項目"]) || state.headers[0];
  state.keyYomi  = pick(["yomi", "よみ", "読み", "かな", "カナ", "ふりがな", "yomigana"]);
  state.keyEn    = pick(["term_en", "english", "en", "英語"]);
  state.keyBody  = pick(["desc", "description", "details", "detail", "説明", "解説", "本文"]) || state.headers[1] || state.headers[0];
}

// ---------- レンダリング ----------
function render(resetSearch = false) {
  if (resetSearch) els.searchInput.value = els.searchInput.value; // no-op

  const q = els.searchInput.value.trim();
  const mode = document.querySelector('input[name="sortMode"]:checked').value; // alpha | gojuon
  const desc = els.sortDesc.checked;

  // 絞り込み
  const qLower = q.toLowerCase();
  const filtered = !q ? state.rows : state.rows.filter(r => {
    return state.headers.some(h => String(r[h]).toLowerCase().includes(qLower));
  });

  // ソートキー取り出し
  const makeKey = (r) => {
    if (mode === "alpha") {
      const a = (state.keyEn && r[state.keyEn]) || r[state.keyTitle] || "";
      return String(a);
    } else {
      const kana = (state.keyYomi && r[state.keyYomi]) || r[state.keyTitle] || "";
      return hira(normalizeKana(String(kana)));
    }
  };

  const collator = new Intl.Collator("ja", { sensitivity: "base", numeric: true });

  const sorted = [...filtered].sort((a, b) => {
    const ka = makeKey(a);
    const kb = makeKey(b);
    const s = collator.compare(ka, kb);
    return desc ? -s : s;
  });

  state.view = sorted;

  // メタ
  els.meta.textContent = `表示: ${sorted.length} / 総件数: ${state.rows.length}　｜　ソート: ${mode === "alpha" ? "A–Z" : "五十音"} ${desc ? "（降順）" : "（昇順）"}`;

  // ボタン群
  els.buttonsWrap.replaceChildren();
  const frag = document.createDocumentFragment();

  sorted.forEach((row, idx) => {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    const title = safe(row[state.keyTitle]);
    const sub = state.keyEn && row[state.keyEn] ? `\n<span class="small">${safe(row[state.keyEn])}</span>` : "";
    const yomi = state.keyYomi && row[state.keyYomi] ? `\n<span class="small">${safe(row[state.keyYomi])}</span>` : "";
    btn.innerHTML = `<strong>${title}</strong>${sub}${yomi}`;
    btn.addEventListener("click", () => openModal(row));
    frag.appendChild(btn);
  });

  els.buttonsWrap.appendChild(frag);
}

// ---------- モーダル ----------
function openModal(row) {
  const title = row[state.keyTitle] || "(no title)";
  els.modalTitle.textContent = title;

  const body = document.createElement("div");
  const keysOrder = new Set([state.keyTitle, state.keyEn, state.keyYomi, state.keyBody].filter(Boolean));
  const ordered = [
    ...Array.from(keysOrder),
    ...state.headers.filter(h => !keysOrder.has(h))
  ];

  const dl = document.createElement("dl");
  for (const h of ordered) {
    if (!(h in row)) continue;
    const v = String(row[h] ?? "").trim();
    if (v === "") continue;

    const dt = document.createElement("dt");
    dt.textContent = h;
    const dd = document.createElement("dd");
    // 👇 追加機能　referenceをリンクにする
    if (h.toLowerCase() === "reference" && v.startsWith("http")) {
      const a = document.createElement("a");
      a.href = v;
      a.textContent = v;
      a.target = "_blank";   // 新しいタブで開く
      a.rel = "noopener noreferrer";
      a.style.color = "#60a5fa";  // お好みで色
      dd.appendChild(a);
    } else {
      dd.textContent = v;
    }
    // 👆 ここまで追加

    dl.append(dt, dd);
  }
  body.appendChild(dl);

  els.modalBody.replaceChildren(body);
  els.modal.showModal();
}

// ---------- ユーティリティ ----------
function safe(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// カタカナ→ひらがな & 半角→全角
function normalizeKana(s) {
  // 半角カナ → 全角カナ
  const toZenkaku = s.replace(/[\uFF61-\uFF9F]/g, ch => {
    const map = '｡､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ';
    const to  = '。、「」・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜';
    const i = map.indexOf(ch);
    return i >= 0 ? to[i] : ch;
  });
  return toZenkaku;
}
function hira(s) {
  // 全角カタカナ → ひらがな
  return s.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function info(msg) { els.meta.textContent = msg; }
