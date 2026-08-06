# 项目长期记忆 — 记事本日历应用

## 项目概述
个人记事本 + 日历 Web 应用，PC + H5 兼容，多设备云同步，免费部署公网可访问。

## 技术选型决策（用户已确认）
- **前端**：Vue 3 + Vite + Vant 4 + TypeScript + Pinia + Vue Router
- **编辑器**：md-editor-v3（Markdown 编辑+预览）
- **本地存储**：IndexedDB（Dexie.js 封装），Local-First 架构
- **云后端**：Supabase 免费版（PostgreSQL + Auth + Realtime + RLS）
- **部署**：Cloudflare Pages（*.pages.dev 免费子域名）
- **PWA**：vite-plugin-pwa
- **冲突策略**：Last-Write-Wins（client_updated_at 时间戳比对）

## 关键约束
- 用户无自有域名，必须用免费子域名
- 全部服务须在免费额度内
- 国内需可访问（Cloudflare Pages 优于 Vercel/Netlify）

## 文档位置
- 方案文档：`/Users/lihaifei/WorkBuddy/2026-08-06-09-18-49/记事本日历应用-开发部署方案.md`

## 迁移考量（Cloudflare → 腾讯云 CloudBase）
- 代码层零改动：dist/ 静态产物平台无关
- 后端层零改动：Supabase 与前端托管平台无关
- 静态托管层低改动：换部署 CLI（wrangler→tcb）、环境变量重配
- **关键障碍：域名备案**——Cloudflare *.pages.dev 免备案；CloudBase 需绑定已 ICP 备案的自定义域名才能境内访问
- 结论：用户若无已备案域名，迁移到 CloudBase 反而比 Cloudflare 麻烦

## 待办
- 等待用户确认是否开始按方案写代码开发
