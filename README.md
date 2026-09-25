# 介入文献雷达网页

这是 GitHub Pages 静态网页。直接用 HTTP 静态服务器打开仓库根目录即可预览，例如：

```bash
python3 -m http.server 8080
```

## 页面数据

- `data/articles.json` 是已收录的文献。页面不会创建或虚构文献记录。
- `data/research-topics.json` 是博士课题方向。每项包含标题、说明、站内匹配规则（`match_all`）和 PubMed 检索式（`pubmed_query`）。
- 课题卡片中的数字是当前 `articles.json` 中匹配标题或摘要的记录数，不代表 PubMed 中的总量。
- 站内“摘要片段”和结构化字段来自现有自动提取结果。引用或临床应用前请核对原文。

## 自动更新说明

这个公开仓库目前只有前端和已发布的数据，未包含生成 `articles.json` 的抓取工作流。因此修改 `research-topics.json` 会立即增加课题入口和站内筛选，但**不会单独改变下一次 PubMed 抓取范围**。若使用独立的更新器，还需把相同的检索式加入其 `config/topics.json`，并更新博士课题相关性规则。随本次交付另附基于现有更新器压缩包制作的主题补丁。

发布此网站时保留 `.nojekyll`、`index.html`、`styles.css`、`app.js`、`favicon.svg` 和 `data/`。
