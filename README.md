# 记事本日历

个人记事本 + 日历 Web 应用，支持 Markdown 编辑、多设备云同步、离线使用、PWA 安装。PC + H5 双端兼容。

## 功能特性

- **记事本**：Markdown 编辑 + 实时预览，标签分类，全文搜索，置顶，自动保存
- **日历**：月视图日历，农历显示，日期关联笔记/事件，事件提醒（浏览器通知）
- **多设备云同步**：基于 Supabase，登录后数据云端备份 + 跨设备实时同步
- **离线可用**：Local-First 架构，数据优先存本地 IndexedDB，断网仍可使用
- **PWA**：可安装到手机桌面，像原生 App 一样全屏启动
- **响应式**：PC 侧边栏布局 + 移动端底部 Tabbar 自适应
- **明暗主题**：浅色/深色/跟随系统
- **数据管理**：JSON 导入导出备份，回收站恢复

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vue 3 + Vite + TypeScript |
| UI 组件库 | Vant 4（移动端） |
| Markdown 编辑器 | md-editor-v3 |
| 状态管理 | Pinia |
| 本地存储 | IndexedDB（Dexie.js 封装） |
| 云后端 | Supabase（PostgreSQL + Auth + Realtime + RLS） |
| PWA | vite-plugin-pwa |
| 部署 | Cloudflare Pages |

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入 Supabase 参数（不配置则降级为纯本地模式）：

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 4. 构建

```bash
npm run build
```

产物输出到 `dist/` 目录。

## Supabase 后端配置

### 1. 创建项目

1. 访问 https://supabase.com 注册（可用 GitHub 登录）
2. New Project → 填项目名、数据库密码、选区域（推荐 Northeast Asia - Tokyo）
3. 等待 2 分钟初始化

### 2. 建表（SQL Editor 执行）

```sql
-- 笔记表
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '',
  content text not null default '',
  tags text[] default '{}',
  note_date date,
  is_pinned boolean default false,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index idx_notes_user_id on notes(user_id);
create index idx_notes_user_date on notes(user_id, note_date);

-- 事件表
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text default '',
  event_date date not null,
  event_time time,
  remind_minutes int,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index idx_events_user_date on events(user_id, event_date);

-- 行级安全（RLS）
alter table notes enable row level security;
create policy "notes select" on notes for select using (auth.uid() = user_id);
create policy "notes insert" on notes for insert with check (auth.uid() = user_id);
create policy "notes update" on notes for update using (auth.uid() = user_id);
create policy "notes delete" on notes for delete using (auth.uid() = user_id);

alter table events enable row level security;
create policy "events select" on events for select using (auth.uid() = user_id);
create policy "events insert" on events for insert with check (auth.uid() = user_id);
create policy "events update" on events for update using (auth.uid() = user_id);
create policy "events delete" on events for delete using (auth.uid() = user_id);

-- 自动更新 updated_at 触发器
create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger trg_notes_updated_at before update on notes for each row execute function update_updated_at();
create trigger trg_events_updated_at before update on events for each row execute function update_updated_at();

-- 启用 Realtime
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table events;
```

### 3. 获取 API 密钥

进入 Settings → API，记录：
- `Project URL`
- `anon public key`

填入 `.env` 文件。

### 4. 启用邮箱登录

Authentication → Providers → 启用 Email（可关闭"确认邮箱"选项方便测试）。

## 部署到 Cloudflare Pages

### 方式一：Git 自动部署（推荐）

1. 代码推送到 GitHub 仓库
2. 注册 https://dash.cloudflare.com
3. Workers & Pages → Create → Pages → Connect to Git
4. 选择仓库，配置：
   - Framework preset: Vue
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables:
     - `NODE_VERSION` = `20`
     - `VITE_SUPABASE_URL` = 你的 Supabase URL
     - `VITE_SUPABASE_ANON_KEY` = 你的 anon key
5. Save and Deploy
6. 获得 `https://项目名.pages.dev` 公网地址

### 方式二：Wrangler CLI

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist --project-name=notes-calendar
```

### 移动端使用

手机浏览器打开 `.pages.dev` 地址 → 浏览器菜单 → "添加到主屏幕" → 桌面生成应用图标。

## 项目结构

```
src/
├── assets/           # 静态资源
├── components/       # 通用组件
├── views/            # 页面视图
│   ├── HomeView.vue        # 笔记列表
│   ├── NoteEditView.vue    # 笔记编辑
│   ├── CalendarView.vue    # 日历
│   ├── SettingsView.vue    # 设置
│   ├── AuthView.vue        # 登录注册
│   └── RecycleView.vue     # 回收站
├── stores/           # Pinia 状态管理
│   ├── auth.ts             # 认证
│   ├── notes.ts            # 笔记
│   ├── events.ts           # 事件
│   └── settings.ts         # 设置
├── services/         # 服务层
│   ├── db.ts               # IndexedDB 本地数据库
│   ├── supabase.ts         # Supabase 客户端
│   ├── sync.ts             # 云同步引擎
│   └── notification.ts     # 通知提醒
├── utils/            # 工具函数
├── types/            # TypeScript 类型
├── router/           # 路由
├── styles/           # 全局样式
├── App.vue           # 根组件（响应式布局）
└── main.ts           # 入口
```

## 架构说明

### Local-First 同步

1. 所有写入先落 IndexedDB（零延迟、离线可用）
2. 后台异步推送到 Supabase
3. 断网时操作进入同步队列，联网后自动补传
4. 多设备通过 Supabase Realtime 实时推送变更

### 冲突解决

采用 Last-Write-Wins 策略：每条记录有 `client_updated_at` 毫秒时间戳，同步时时间戳大的覆盖小的。

## 成本

全免费额度内可运行：
- Cloudflare Pages：无限请求、500 次构建/月、20GB 带宽
- Supabase：500MB 数据库、50000 月活、2GB 带宽
- GitHub：公开仓库无限

## License

MIT
