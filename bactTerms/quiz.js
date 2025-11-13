/* =========================================================
   用語クイズ（タイマー付き版）
   - CSV を読み込んで term / definition からクイズを生成
   - term がないときは「用語」列 → 問題
   - definition がないときは「説明」列 → 選択肢
   - 長い説明は最初の文（「。」or「.」まで）を使用
     ※ 3.5 など「数字.数字」は小数点として扱い、文末にしない
   - カテゴリ: category または 主区分 などを自動検出
   - デフォルト: terms.csv、任意の外部CSVも選択可能
   - 1問20秒のタイマー／時間切れで自動的に選択不可＋「次へ」表示
   - 結果画面に「回答時間・正解数・問題数・正解率」を表示
========================================================= */

const quizState = {
  rows: [],
  headers: [],
  questionKey: null,
  answerKey: null,
  categoryKey: null,
  questions: [],
  currentIndex: 0,
  correctCount: 0,
  currentFileName: "terms.csv",
  // タイマー関連
  timeLimitMs: 20000, // 20秒
  timerId: null,
  questionStartTime: 0,
  answerTimes: [] // 各問題の回答時間（秒）
};

const els = {};

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  attachEvents();
  loadDefaultCSV();
});

function cacheElements() {
  els.csvFileInput = document.getElementById("csvFileInput");
  els.csvFileName = document.getElementById("csvFileName");
  els.categorySelect = document.getElementById("categorySelect");
  els.questionCount = document.getElementById("questionCount");
  els.startQuizBtn = document.getElementById("startQuizBtn");
  els.summaryText = document.getElementById("summaryText");
  els.summaryList = document.getElementById("summaryList");

  // クイズモーダル
  els.quizModal = document.getElementById("quizModal");
  els.quizQuestionTitle = document.getElementById("quizQuestionTitle");
  els.quizQuestionText = document.getElementById("quizQuestionText");
  els.quizCategoryText = document.getElementById("quizCategoryText");
  els.quizChoices = document.getElementById("quizChoices");
  els.quizFeedback = document.getElementById("quizFeedback");
  els.quizCloseBtn = document.getElementById("quizCloseBtn");
  els.nextQuestionBtn = document.getElementById("nextQuestionBtn");

  // タイマーUI
  els.timerLabel = document.getElementById("timerLabel");
  els.timerFill = document.getElementById("timerFill");

  // 結果モーダル
  els.resultModal = document.getElementById("resultModal");
  els.resultSummary = document.getElementById("resultSummary");
  els.resultMessage = document.getElementById("resultMessage");
  els.resultCloseBtn = document.getElementById("resultCloseBtn");
  els.resultOkBtn = document.getElementById("resultOkBtn");
}

function attachEvents() {
  els.startQuizBtn.addEventListener("click", startQuiz);

  // 外部CSVファイル選択
  els.csvFileInput.addEventListener("change", handleCSVFileSelected);

  // クイズモーダルの閉じる
  els.quizCloseBtn.addEventListener("click", () => {
    if (els.quizModal.open) els.quizModal.close();
    clearTimer();
  });

  // 次の問題 / 結果へ
  els.nextQuestionBtn.addEventListener("click", () => {
    handleNextQuestion();
  });

  // 結果モーダルの閉じる
  const closeResult = () => {
    if (els.resultModal.open) els.resultModal.close();
  };
  els.resultCloseBtn.addEventListener("click", closeResult);
  els.resultOkBtn.addEventListener("click", closeResult);
}

/* ---------- デフォルトCSV読み込み (terms.csv) ---------- */

async function loadDefaultCSV() {
  try {
    const res = await fetch("terms.csv", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    const text = await res.text();
    processCSVText(text, "terms.csv");
  } catch (e) {
    console.error(e);
    els.summaryText.textContent =
      "terms.csv を読み込めませんでした。ファイル選択からCSVを読み込んでください。";
  }
}

/* ---------- 外部CSV読み込み ---------- */

function handleCSVFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    processCSVText(text, file.name || "外部CSV");
  };
  reader.readAsText(file, "utf-8");
}

/* ---------- CSV処理共通 ---------- */

function processCSVText(text, fileName) {
  const { headers, rows } = parseCSV(text);
  if (!headers.length || !rows.length) {
    els.summaryText.textContent = `${fileName} に有効なデータがありません。`;
    els.summaryList.innerHTML = "";
    return;
  }

  quizState.headers = headers;
  quizState.rows = rows;
  quizState.currentFileName = fileName;

  detectKeys();
  buildCategoryOptions();
  updateSummary();

  if (els.csvFileName) {
    els.csvFileName.textContent = `現在: ${fileName}`;
  }
}

// RFC4180 風CSVパーサ（ダブルクォート対応）
function parseCSV(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQ = true;
        } else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((ln) => {
    const cells = parseLine(ln);
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });

  return { headers: header, rows };
}

/* ---------- キー検出 ---------- */

function detectKeys() {
  const headers = quizState.headers;
  const lowerMap = new Map();
  headers.forEach((h) => lowerMap.set(h.toLowerCase(), h));

  const pickExact = (cands) => {
    for (const c of cands) {
      if (lowerMap.has(c)) return lowerMap.get(c);
    }
    return null;
  };

  // 問題列
  quizState.questionKey =
    pickExact(["term", "用語", "見出し", "title"]) || headers[0];

  // 説明列
  quizState.answerKey =
    pickExact(["definition", "定義", "説明", "desc", "description"]) ||
    headers[1] ||
    headers[0];

  // カテゴリ列
  quizState.categoryKey =
    pickExact(["category", "カテゴリ", "主区分", "domain", "section"]) ||
    null;
}

/* ---------- カテゴリ一覧 ---------- */

function buildCategoryOptions() {
  const select = els.categorySelect;
  if (!select) return;

  if (!quizState.categoryKey) {
    select.innerHTML =
      '<option value="">（カテゴリ列なし）</option>';
    select.disabled = true;
    return;
  }

  const key = quizState.categoryKey;
  const set = new Set();
  quizState.rows.forEach((row) => {
    const v = (row[key] || "").trim();
    if (v) set.add(v);
  });

  select.disabled = false;
  select.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "（すべて）";
  select.appendChild(optAll);

  Array.from(set)
    .sort()
    .forEach((cat) => {
      const o = document.createElement("option");
      o.value = cat;
      o.textContent = cat;
      select.appendChild(o);
    });
}

/* ---------- サマリー更新 ---------- */

function updateSummary() {
  const rows = quizState.rows;
  const headers = quizState.headers;
  const total = rows.length;

  els.summaryText.textContent = `読み込み済み: ${quizState.currentFileName} (${total} 行)`;

  const li1 = document.createElement("li");
  li1.textContent = `ヘッダ: ${headers.join(", ")}`;

  const li2 = document.createElement("li");
  li2.textContent = `問題列: ${quizState.questionKey}`;

  const li3 = document.createElement("li");
  li3.textContent = `説明列: ${quizState.answerKey}`;

  const li4 = document.createElement("li");
  li4.textContent = `カテゴリ列: ${
    quizState.categoryKey || "（なし）"
  }`;

  els.summaryList.innerHTML = "";
  [li1, li2, li3, li4].forEach((li) => els.summaryList.appendChild(li));
}

/* ---------- クイズ開始 ---------- */

function startQuiz() {
  if (!quizState.rows.length) {
    alert("CSV が読み込まれていません。");
    return;
  }

  const count = Math.max(
    1,
    Math.min(100, Number.parseInt(els.questionCount.value, 10) || 5)
  );
  els.questionCount.value = String(count);

  const categoryValue = els.categorySelect.disabled
    ? ""
    : els.categorySelect.value;

  let candidates = quizState.rows.filter((row) => isValidQA(row));

  if (categoryValue && quizState.categoryKey) {
    candidates = candidates.filter(
      (row) => (row[quizState.categoryKey] || "") === categoryValue
    );
  }

  if (!candidates.length) {
    alert("この条件に合う問題がありません。");
    return;
  }

  shuffleInPlace(candidates);

  quizState.questions = candidates.slice(0, count);
  quizState.currentIndex = 0;
  quizState.correctCount = 0;
  quizState.answerTimes = new Array(count).fill(null);

  showQuestion();
}

/* ---------- 1問表示 ---------- */

function showQuestion() {
  if (!quizState.questions.length) return;

  clearTimer();

  const idx = quizState.currentIndex;
  const qRow = quizState.questions[idx];

  let qText = (qRow[quizState.questionKey] || "").trim();
  if (!qText) {
    // 万が一用語が空なら、行番号を問題文代わりにする
    qText = "(この行の用語が空です)";
  }

  const cat =
    quizState.categoryKey && qRow[quizState.categoryKey]
      ? qRow[quizState.categoryKey]
      : "";

  els.quizQuestionTitle.textContent = `Q${idx + 1} / ${
    quizState.questions.length
  }`;
  els.quizQuestionText.textContent = qText;
  els.quizCategoryText.textContent = cat ? `カテゴリ: ${cat}` : "";

  els.quizFeedback.textContent = "";
  els.quizFeedback.className = "feedback";

  // 「次へ」ボタンは最初は隠しておく（回答 or 時間切れで出す）
  els.nextQuestionBtn.style.visibility = "hidden";

  // 選択肢生成
  const choices = buildChoicesForRow(qRow, cat);
  els.quizChoices.innerHTML = "";

  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.textContent = choice.text;
    btn.dataset.correct = choice.correct ? "1" : "0";
    btn.addEventListener("click", () => handleChoiceClick(btn));
    els.quizChoices.appendChild(btn);
  });

  els.nextQuestionBtn.textContent =
    idx === quizState.questions.length - 1 ? "結果を見る" : "次の問題へ";

  els.quizModal.dataset.answered = "0";

  // タイマー開始
  quizState.questionStartTime = performance.now();
  updateTimerUI(0); // 残り20.0秒表示
  startTimer();

  if (!els.quizModal.open) {
    els.quizModal.showModal();
  }
}

/* ---------- タイマー制御 ---------- */

function startTimer() {
  clearTimer();

  const limit = quizState.timeLimitMs;
  quizState.timerId = setInterval(() => {
    const now = performance.now();
    const elapsed = now - quizState.questionStartTime;
    if (elapsed >= limit) {
      updateTimerUI(limit);
      clearTimer();
      handleTimeUp(); // 時間切れ処理
    } else {
      updateTimerUI(elapsed);
    }
  }, 100);
}

function clearTimer() {
  if (quizState.timerId != null) {
    clearInterval(quizState.timerId);
    quizState.timerId = null;
  }
}

// elapsedMs: 経過時間(ms)を渡す（0〜limit）
function updateTimerUI(elapsedMs) {
  const limit = quizState.timeLimitMs;
  const clamped = Math.max(0, Math.min(limit, elapsedMs));
  const remainingMs = limit - clamped;
  const remainingSec = remainingMs / 1000;

  if (els.timerLabel) {
    els.timerLabel.textContent = `残り ${remainingSec.toFixed(1)} 秒`;
  }

  if (els.timerFill) {
    const ratio = remainingMs / limit;
    els.timerFill.style.transform = `scaleX(${ratio})`;
  }
}

// 質問ごとの回答時間を記録（秒）
function recordAnswerTime(elapsedMs) {
  const limit = quizState.timeLimitMs;
  const clamped = Math.max(0, Math.min(limit, elapsedMs));
  const sec = clamped / 1000;
  quizState.answerTimes[quizState.currentIndex] = sec;
}

/* ---------- 選択肢クリック ---------- */

function handleChoiceClick(btn) {
  if (els.quizModal.dataset.answered === "1") return;
  els.quizModal.dataset.answered = "1";

  clearTimer();

  const now = performance.now();
  const elapsed = now - quizState.questionStartTime;
  recordAnswerTime(elapsed);

  const isCorrect = btn.dataset.correct === "1";
  if (isCorrect) quizState.correctCount++;

  // 全ボタンの見た目を更新
  const buttons = Array.from(
    els.quizChoices.querySelectorAll(".choice-btn")
  );
  buttons.forEach((b) => {
    b.disabled = true;
    const ok = b.dataset.correct === "1";
    if (ok) {
      b.classList.add("choice-correct");
    }
  });
  if (!isCorrect) {
    btn.classList.add("choice-wrong");
  }

  // フィードバック
  if (isCorrect) {
    els.quizFeedback.textContent = "正解！よくできました。";
    els.quizFeedback.className = "feedback correct";
  } else {
    els.quizFeedback.textContent =
      "残念… 正しい説明をよく確認しておきましょう。";
    els.quizFeedback.className = "feedback wrong";
  }

  // 次へのボタンを表示
  els.nextQuestionBtn.style.visibility = "visible";
}

/* ---------- 時間切れ処理 ---------- */

function handleTimeUp() {
  if (els.quizModal.dataset.answered === "1") return;
  els.quizModal.dataset.answered = "1";

  // 時間上限を回答時間として記録
  recordAnswerTime(quizState.timeLimitMs);

  // ボタンを全て無効化し、正解だけ強調
  const buttons = Array.from(
    els.quizChoices.querySelectorAll(".choice-btn")
  );
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.dataset.correct === "1") {
      b.classList.add("choice-correct");
    }
  });

  els.quizFeedback.textContent =
    "時間切れです。正しい説明を確認しておきましょう。";
  els.quizFeedback.className = "feedback wrong";

  // 次へのボタンを表示
  els.nextQuestionBtn.style.visibility = "visible";
}

/* ---------- 次の問題 / 結果 ---------- */

function handleNextQuestion() {
  if (!quizState.questions.length) return;

  if (quizState.currentIndex < quizState.questions.length - 1) {
    quizState.currentIndex++;
    showQuestion();
  } else {
    // 最終問題 → 結果へ
    clearTimer();
    if (els.quizModal.open) els.quizModal.close();
    showResult();
  }
}

function showResult() {
  const total = quizState.questions.length;
  const correct = quizState.correctCount;
  const rate = total ? correct / total : 0;

  const limitSec = quizState.timeLimitMs / 1000;
  const totalTimeSec = (quizState.answerTimes || []).reduce(
    (sum, t) => sum + (t != null ? t : limitSec),
    0
  );

  // 結果の基本情報
  const ratePercent = Math.round(rate * 100);
  els.resultSummary.innerHTML = `
    問題数：${total} 問<br>
    正解数：${correct} 問<br>
    正解率：${ratePercent} %<br>
    合計回答時間：${totalTimeSec.toFixed(1)} 秒
  `;

  let msg = "";
  if (rate >= 0.8) {
    msg =
      "素晴らしい！かなり理解できています。この調子で別カテゴリも挑戦してみましょう。";
  } else if (rate >= 0.5) {
    msg =
      "よくできています。間違えた用語を中心に、CSVの内容を見直してみましょう。";
  } else {
    msg =
      "今回は少し難しかったかもしれません。用語ブラウザで意味を確認してから、もう一度チャレンジしてみましょう。";
  }

  els.resultMessage.textContent = msg;
  els.resultModal.showModal();
}

/* ---------- 補助関数 ---------- */

// 有効な問題行かどうか（問題＆説明どちらも非空）
function isValidQA(row) {
  const q = (row[quizState.questionKey] || "").trim();
  const a = (row[quizState.answerKey] || "").trim();
  return q && a;
}

// 1行から選択肢を作る
function buildChoicesForRow(row, categoryValue) {
  const correctText = getAnswerSentence(row);

  let pool = quizState.rows.filter((r) => r !== row && isValidQA(r));

  if (categoryValue && quizState.categoryKey) {
    const catKey = quizState.categoryKey;
    const sameCat = pool.filter(
      (r) => (r[catKey] || "") === categoryValue
    );
    if (sameCat.length >= 3) {
      pool = sameCat;
    }
  }

  shuffleInPlace(pool);

  const distractors = [];
  for (const r of pool) {
    const t = getAnswerSentence(r);
    if (!t) continue;
    if (t === correctText) continue;
    if (distractors.includes(t)) continue;
    distractors.push(t);
    if (distractors.length >= 3) break;
  }

  const choiceObjects = [
    { text: correctText, correct: true },
    ...distractors.map((t) => ({ text: t, correct: false }))
  ];

  shuffleInPlace(choiceObjects);
  return choiceObjects;
}

// 説明列から最初のセンテンスを取り出す
// ただし「数字.数字」は小数点として扱い、そこで切らない
function getAnswerSentence(row) {
  const raw = (row[quizState.answerKey] || "").trim();
  if (!raw) return "";

  const jpIdx = raw.indexOf("。");
  const dotIdx = findSentenceDot(raw);

  let cutIdx = -1;
  if (jpIdx >= 0 && dotIdx >= 0) {
    cutIdx = Math.min(jpIdx, dotIdx);
  } else if (jpIdx >= 0) {
    cutIdx = jpIdx;
  } else if (dotIdx >= 0) {
    cutIdx = dotIdx;
  }

  if (cutIdx >= 0) {
    return raw.slice(0, cutIdx + 1).trim();
  }
  return raw;
}

// 文末候補となる '.' の位置を探す
// 前後が数字なら小数点とみなしてスキップ
function findSentenceDot(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ".") continue;
    const prev = i > 0 ? text[i - 1] : "";
    const next = i + 1 < text.length ? text[i + 1] : "";

    const prevIsDigit = prev >= "0" && prev <= "9";
    const nextIsDigit = next >= "0" && next <= "9";

    // 両方数字なら小数点
    if (prevIsDigit && nextIsDigit) continue;

    // 文末候補: ここで区切る
    return i;
  }
  return -1;
}

// 配列シャッフル
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
