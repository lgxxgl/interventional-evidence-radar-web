const STORAGE_KEY = "ieradar2-state-v1";
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[char]);
const unique = (items) => [...new Set(items.filter(Boolean))];
const dateKey = (date = new Date()) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")
].join("-");
const daysAgo = (count) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return dateKey(date);
};
const firstSeen = (article) => article.first_seen || article.date || "";
const articleId = (article) => article.id || article.pmid || article.doi || article.title;
const stars = (score) => "★".repeat(Math.max(0, Math.min(5, Number(score) || 0))) +
  "☆".repeat(5 - Math.max(0, Math.min(5, Number(score) || 0)));
const excerpt = (text, length = 280) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > length ? clean.slice(0, length).replace(/\s+\S*$/, "") + "…" : clean;
};

let db = { meta: {}, articles: [] };
let focusTopics = [];
let state = { read: {}, saved: {}, view: "today" };
let mode = "cards";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state = {
      read: saved.read && typeof saved.read === "object" ? saved.read : {},
      saved: saved.saved && typeof saved.saved === "object" ? saved.saved : {},
      view: ["today", "7d", "all", "saved"].includes(saved.view) ? saved.view : "today"
    };
  } catch { /* Browsing remains available if local storage is blocked. */ }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Ignore storage errors. */ }
}
function focusMatches(article, topic) {
  if ((article.topics || []).includes(topic.title)) return true;
  const text = [article.title, article.abstract].filter(Boolean).join(" ");
  return (topic.match_all || []).every((pattern) => {
    try { return new RegExp(pattern, "i").test(text); } catch { return false; }
  });
}
function topicMatches(article, selected) {
  if (!selected) return true;
  const focus = focusTopics.find((topic) => topic.id === selected);
  return focus ? focusMatches(article, focus) : (article.topics || []).includes(selected);
}
function queryUrl(topic) {
  return "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(topic.pubmed_query);
}
function buildFilters() {
  const selectedTopic = $("#topicFilter").value;
  const selectedDesign = $("#designFilter").value;
  const topicSelect = $("#topicFilter");
  topicSelect.replaceChildren(new Option("全部主题", ""));
  if (focusTopics.length) {
    const group = document.createElement("optgroup");
    group.label = "博士课题方向";
    focusTopics.forEach((topic) => group.append(new Option(topic.title, topic.id)));
    topicSelect.append(group);
  }
  const published = unique(db.articles.flatMap((article) => article.topics || [])).sort();
  if (published.length) {
    const group = document.createElement("optgroup");
    group.label = "文献已有标签";
    published.forEach((topic) => group.append(new Option(topic, topic)));
    topicSelect.append(group);
  }
  topicSelect.value = selectedTopic;
  const designSelect = $("#designFilter");
  designSelect.replaceChildren(new Option("全部类型", ""));
  unique(db.articles.map((article) => article.design)).sort().forEach((design) => {
    designSelect.append(new Option(design, design));
  });
  designSelect.value = selectedDesign;
}
function filtered() {
  const topic = $("#topicFilter").value;
  const design = $("#designFilter").value;
  const minScore = Number($("#scoreFilter").value);
  const query = $("#searchBox").value.trim().toLocaleLowerCase();
  const unreadOnly = $("#unreadOnly").checked;
  const phdOnly = $("#phdOnly").checked;
  const sort = $("#sortSelect").value;
  const today = dateKey();
  const weekStart = daysAgo(6);
  const articles = db.articles.filter((article) => {
    const id = articleId(article);
    const seen = firstSeen(article);
    if (state.view === "today" && seen !== today) return false;
    if (state.view === "7d" && seen < weekStart) return false;
    if (state.view === "saved" && !state.saved[id]) return false;
    if (!topicMatches(article, topic)) return false;
    if (design && article.design !== design) return false;
    if ((Number(article.score) || 0) < minScore) return false;
    if (unreadOnly && state.read[id]) return false;
    if (phdOnly && (Number(article.phd_relevance_score) || 0) < 4) return false;
    if (query) {
      const searchText = [article.title, article.authors, article.journal, article.abstract,
        article.summary_cn, article.phd_relevance, ...(article.topics || [])].join(" ").toLocaleLowerCase();
      if (!searchText.includes(query)) return false;
    }
    return true;
  });
  return articles.sort((a, b) => {
    if (sort === "date") return (b.date || "").localeCompare(a.date || "") || (b.score || 0) - (a.score || 0);
    if (sort === "discovered") return firstSeen(b).localeCompare(firstSeen(a)) || (b.score || 0) - (a.score || 0);
    return (b.score || 0) - (a.score || 0) || (b.date || "").localeCompare(a.date || "");
  });
}
function renderMetrics() {
  const articles = db.articles;
  const today = dateKey();
  const weekStart = daysAgo(6);
  const values = [
    ["今日新增", articles.filter((article) => firstSeen(article) === today).length],
    ["近 7 天", articles.filter((article) => firstSeen(article) >= weekStart).length],
    ["高相关文献", articles.filter((article) => Number(article.score) >= 4).length],
    ["博士课题相关", articles.filter((article) => Number(article.phd_relevance_score) >= 4).length],
    ["已收藏", articles.filter((article) => state.saved[articleId(article)]).length]
  ];
  $("#metrics").innerHTML = values.map(([label, count]) =>
    `<div class="metric"><b>${count}</b><span>${label}</span></div>`).join("");
}
function renderFocus() {
  $("#focusTopics").innerHTML = focusTopics.map((topic, index) => {
    const count = db.articles.filter((article) => focusMatches(article, topic)).length;
    return `<article class="focus-card">
      <span class="focus-number">FOCUS / ${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(topic.title)}</h3>
      <p>${escapeHtml(topic.description)}</p>
      <div class="focus-actions">
        <button class="focus-filter" type="button" data-focus="${escapeHtml(topic.id)}">查看站内文献 · ${count}</button>
        <a class="focus-pubmed" href="${queryUrl(topic)}" target="_blank" rel="noopener noreferrer" aria-label="在 PubMed 检索${escapeHtml(topic.title)}">PubMed ↗</a>
      </div>
    </article>`;
  }).join("");
}
function cardSummary(article) {
  const chinese = String(article.summary_cn || "").trim();
  if (chinese && !/已完成.*摘要级结构化提取/.test(chinese)) {
    return { label: "中文速览", text: excerpt(chinese, 210) };
  }
  const source = article.key_results || article.abstract || "";
  return { label: "摘要片段 · 自动提取", text: excerpt(source, 230) || "暂无可用摘要，请打开 PubMed 阅读原文。" };
}
function detailItem(label, value) {
  return `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "未提取")}</dd></div>`;
}
function makeCard(article) {
  const node = $("#cardTemplate").content.cloneNode(true);
  const id = articleId(article);
  const card = node.querySelector(".card");
  card.classList.toggle("read", !!state.read[id]);
  card.classList.toggle("saved", !!state.saved[id]);
  node.querySelector(".tags").innerHTML = [
    `<span class="tag score" aria-label="相关性 ${Number(article.score) || 0} 星">${stars(article.score)}</span>`,
    ...(article.topics || []).slice(0, 2).map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`),
    ...(Number(article.phd_relevance_score) >= 4 ? ['<span class="tag phd">博士课题相关</span>'] : [])
  ].join("");
  node.querySelector(".title").textContent = article.title || "未命名文献";
  node.querySelector(".journal").textContent = article.journal || "期刊未提供";
  node.querySelector(".date").textContent = article.date ? `发表 ${article.date}` : "发表日期未提供";
  node.querySelector(".authors").textContent = article.authors || "作者信息未提供";
  const summary = cardSummary(article);
  node.querySelector(".summary-label").textContent = summary.label;
  node.querySelector(".summary-text").textContent = summary.text;
  node.querySelector(".design").textContent = article.design || "未提取";
  node.querySelector(".sample").textContent = article.sample_size || "未提取";
  node.querySelector(".endpoint").textContent = article.primary_endpoint || "未提取";
  node.querySelector(".phd").textContent = `${Number(article.phd_relevance_score) || 0} / 5`;
  node.querySelector(".first-seen").textContent = firstSeen(article) ? `雷达发现 ${firstSeen(article)}` : "";
  node.querySelector(".details-body").innerHTML = [
    detailItem("研究对象", article.population),
    detailItem("干预", article.intervention),
    detailItem("对照", article.comparator),
    detailItem("PFS", article.pfs),
    detailItem("OS", article.os),
    detailItem("安全性", article.safety),
    detailItem("博士课题意义", article.phd_relevance),
    detailItem("原始摘要", article.abstract),
    detailItem("数据范围", article.evidence_scope || "PubMed 标题与摘要")
  ].join("");
  const links = [];
  if (article.pmid) links.push(`<a target="_blank" rel="noopener noreferrer" href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(article.pmid)}/">PubMed ↗</a>`);
  if (article.doi) links.push(`<a target="_blank" rel="noopener noreferrer" href="https://doi.org/${encodeURIComponent(article.doi)}">DOI ↗</a>`);
  node.querySelector(".links").innerHTML = links.join("");
  const saveButton = node.querySelector(".save-btn");
  saveButton.textContent = state.saved[id] ? "★" : "☆";
  saveButton.classList.toggle("on", !!state.saved[id]);
  saveButton.setAttribute("aria-pressed", !!state.saved[id]);
  saveButton.onclick = () => { state.saved[id] = !state.saved[id]; saveState(); render(); };
  const readButton = node.querySelector(".read-btn");
  readButton.textContent = state.read[id] ? "标为未读" : "标为已读";
  readButton.onclick = () => { state.read[id] = !state.read[id]; saveState(); render(); };
  return node;
}
function renderCards(articles) {
  const box = $("#cards");
  box.replaceChildren();
  if (!articles.length) {
    const topic = focusTopics.find((item) => item.id === $("#topicFilter").value);
    box.innerHTML = `<div class="empty"><h3>暂无符合条件的文献</h3><p>可调整日期或相关性筛选。博士课题方向会保留在列表中，等待后续数据收录。</p>${topic ? `<a href="${queryUrl(topic)}" target="_blank" rel="noopener noreferrer">在 PubMed 检索${escapeHtml(topic.title)} ↗</a>` : ""}</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  articles.forEach((article) => fragment.append(makeCard(article)));
  box.append(fragment);
}
function showEvidence(articles) {
  const columns = [
    ["标题", (a) => a.title], ["发表日期", (a) => a.date], ["主题", (a) => (a.topics || []).join("、")],
    ["研究类型", (a) => a.design], ["样本量", (a) => a.sample_size], ["干预", (a) => a.intervention],
    ["主要终点", (a) => a.primary_endpoint], ["PFS", (a) => a.pfs], ["OS", (a) => a.os],
    ["安全性", (a) => a.safety], ["相关性", (a) => stars(a.score)], ["博士课题", (a) => a.phd_relevance]
  ];
  $("#evidenceTable").innerHTML = `<thead><tr>${columns.map(([title]) => `<th scope="col">${title}</th>`).join("")}</tr></thead><tbody>${articles.map((article) =>
    `<tr>${columns.map(([, getter]) => `<td>${escapeHtml(getter(article) || "—")}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function showWeekly() {
  const today = dateKey();
  const weekStart = daysAgo(6);
  const articles = db.articles.filter((article) => firstSeen(article) >= weekStart)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const top = articles.filter((article) => Number(article.score) >= 4).slice(0, 8);
  const phd = articles.filter((article) => Number(article.phd_relevance_score) >= 4).slice(0, 8);
  const list = (items, detail) => items.length
    ? `<ol>${items.map((article) => `<li><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(detail(article))}</span></li>`).join("")}</ol>`
    : "<p>本周暂无符合条件的文献。</p>";
  $("#weeklyReport").innerHTML = `<p>统计区间：<strong>${weekStart} 至 ${today}</strong> · 共收录 <strong>${articles.length}</strong> 篇。</p>
    <h3>高相关文献</h3>${list(top, (a) => a.journal || "")}
    <h3>与博士课题相关</h3>${list(phd, (a) => a.phd_relevance || "")}`;
}
function render() {
  renderMetrics();
  renderFocus();
  [...$("#viewTabs").querySelectorAll("button")].forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  const articles = filtered();
  $("#statusLine").textContent = `当前显示 ${articles.length} / ${db.articles.length} 篇`;
  $("#cards").classList.toggle("hidden", mode !== "cards");
  $("#evidenceSection").classList.toggle("hidden", mode !== "evidence");
  $("#weeklySection").classList.toggle("hidden", mode !== "weekly");
  if (mode === "cards") renderCards(articles);
  if (mode === "evidence") showEvidence(articles);
  if (mode === "weekly") showWeekly();
}
function wire() {
  $("#viewTabs").onclick = (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    mode = "cards";
    saveState();
    render();
  };
  ["topicFilter", "scoreFilter", "designFilter", "unreadOnly", "phdOnly", "sortSelect"].forEach((id) => {
    $("#" + id).addEventListener("change", render);
  });
  $("#searchBox").addEventListener("input", render);
  $("#focusTopics").onclick = (event) => {
    const button = event.target.closest("button[data-focus]");
    if (!button) return;
    $("#topicFilter").value = button.dataset.focus;
    $("#scoreFilter").value = "0";
    state.view = "all";
    mode = "cards";
    saveState();
    render();
    $(".workspace").scrollIntoView({ behavior: "smooth" });
  };
  $("#clearFilters").onclick = () => {
    $("#topicFilter").value = "";
    $("#scoreFilter").value = "4";
    $("#designFilter").value = "";
    $("#searchBox").value = "";
    $("#unreadOnly").checked = false;
    $("#phdOnly").checked = false;
    $("#sortSelect").value = "relevance";
    state.view = "today";
    mode = "cards";
    saveState();
    render();
  };
  $("#evidenceBtn").onclick = () => { mode = "evidence"; render(); $(".content").scrollIntoView({ behavior: "smooth" }); };
  $("#weeklyBtn").onclick = () => { mode = "weekly"; render(); $(".content").scrollIntoView({ behavior: "smooth" }); };
  $("#closeEvidence").onclick = $("#closeWeekly").onclick = () => { mode = "cards"; render(); };
  $("#resetBtn").onclick = () => {
    if (!confirm("清除本机保存的收藏和阅读状态？此操作无法撤销。")) return;
    state = { read: {}, saved: {}, view: "today" };
    saveState();
    mode = "cards";
    render();
  };
  $("#exportBtn").onclick = () => {
    const articles = db.articles.filter((article) => state.saved[articleId(article)]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), articles }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interventional-radar-saved.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("#importFile").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const articles = Array.isArray(imported) ? imported : imported.articles;
      if (!Array.isArray(articles)) throw new Error("Missing articles array");
      db = { meta: imported.meta || { updated_at: dateKey(), source: "导入的 JSON" }, articles };
      $("#lastUpdated").textContent = `数据更新时间：${db.meta.updated_at || "—"} · 数据源：${db.meta.source || "导入的 JSON"}`;
      buildFilters();
      mode = "cards";
      render();
    } catch {
      alert("JSON 文件格式无法识别：需要 articles 数组。");
    }
    event.target.value = "";
  };
}
async function boot() {
  loadState();
  try {
    const [articlesResponse, topicsResponse] = await Promise.all([
      fetch("data/articles.json", { cache: "no-store" }),
      fetch("data/research-topics.json", { cache: "no-store" })
    ]);
    if (!articlesResponse.ok || !topicsResponse.ok) throw new Error("Failed to load data");
    db = await articlesResponse.json();
    focusTopics = await topicsResponse.json();
    if (!Array.isArray(db.articles) || !Array.isArray(focusTopics)) throw new Error("Invalid data");
    $("#lastUpdated").textContent = `数据更新时间：${db.meta?.updated_at || "—"} · 数据源：${db.meta?.source || "PubMed"}`;
  } catch {
    $("#lastUpdated").textContent = "文献数据加载失败，请稍后刷新页面。";
  }
  buildFilters();
  wire();
  render();
}
boot();
