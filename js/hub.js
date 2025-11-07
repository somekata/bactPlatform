document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("hubContent");
  const searchBox = document.getElementById("hubSearch");

  // 未指定カテゴリ用のデフォ虹ローテ
  const THEME_CYCLE = ["red","orange","yellow","green","teal","blue","indigo","violet","pink"];

  try {
    const res = await fetch("data/hub.json");
    const data = await res.json();

    function renderCards(filter = "") {
      container.innerHTML = "";
      const q = filter.toLowerCase();

      data.forEach((section, idx) => {
        const theme = (section.theme || THEME_CYCLE[idx % THEME_CYCLE.length]).toLowerCase();

        // セクション見出し
        const h2 = document.createElement("h2");
        h2.className = "cat-title";
        h2.textContent = section.category;
        container.appendChild(h2);

        // セクション（テーマをクラスで付与）
        const sec = document.createElement("section");
        sec.className = `cards theme-${theme}`;

        section.items.forEach(item => {
          const match =
            !q ||
            item.title.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            (item.tags && item.tags.join(" ").toLowerCase().includes(q));
          if (!match) return;

          const art = document.createElement("article");
          art.className = "card";
          art.dataset.tags = (item.tags || []).join(" ");

          art.innerHTML = `
            <div class="card-body">
              <h3 class="card-title">${item.title}</h3>
              <p class="card-desc">${item.desc}</p>
            </div>
            <div class="card-foot">
              <div class="card-meta">カテゴリ: ${section.category}</div>
              <a class="btn btn-primary" href="${item.url}" target="_blank" rel="noopener noreferrer">開く</a>
            </div>`;
          sec.appendChild(art);
        });

        if (sec.children.length) container.appendChild(sec);
      });
    }

    renderCards();
    searchBox?.addEventListener("input", e => renderCards(e.target.value));
  } catch (err) {
    console.error("JSON読み込みエラー:", err);
    container.innerHTML = "<p>データの読み込みに失敗しました。</p>";
  }
});
