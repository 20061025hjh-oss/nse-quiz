# 国家安全教育随机答题网站｜Supabase 云端排行榜版

这是一个可直接部署到 Vercel 的静态答题网站。用户用手机打开网页后，输入姓名开始答题；系统每次从 `questions.js` 题库中随机抽取 50 道题，每题 2 分，满分 100 分。提交后会显示总分、正确题数、错题详情、用户选择、正确答案和全部题目答案，并把本次答题记录保存到 Supabase。

排行榜是云端共享排行榜，按“每一次提交记录”排名，不按姓名合并最高分。同一个人多次答题会显示多条记录。

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构和脚本引入入口 |
| `style.css` | 响应式页面样式，适配手机端 |
| `app.js` | 抽题、作答、严格判分、结果页、Supabase 保存、排行榜和 Realtime |
| `questions.js` | 题库数据，当前 286 题 |
| `supabase-config.js` | 填写 Supabase Project URL 和 anon public key |
| `supabase-schema.sql` | Supabase 建表、RLS 权限和 Realtime SQL |
| `vercel.json` | Vercel 静态部署响应头配置 |
| `README.md` | 部署和测试说明 |

## Supabase 创建项目

1. 打开 [Supabase](https://supabase.com/)，创建一个新项目。
2. 进入项目后台，打开 `SQL Editor`。
3. 点击 `New query`。
4. 打开本项目的 `supabase-schema.sql`，复制全部内容。
5. 粘贴到 SQL Editor，点击 `Run`。

执行成功后会创建或更新 `public.quiz_attempts` 表，主要字段包括：

- `id`
- `name`
- `score`
- `correct_count`
- `total_count`
- `duration_seconds`
- `answers`
- `details`
- `created_at`

SQL 会开启 RLS，并允许 `anon` 和 `authenticated` 用户读取排行榜、插入新答题记录；不会给前端用户更新或删除记录的权限。

## 填写 Supabase 配置

打开 `supabase-config.js`：

```js
window.SUPABASE_CONFIG = {
  url: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
  anonKey: "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE"
};
```

把两个占位符替换为 Supabase 项目后台的真实信息：

```text
Project Settings -> API -> Project URL
Project Settings -> API -> anon public key
```

只填 `anon public key`。不要把 `service_role key` 或其它私密密钥放进前端代码。

## 本地预览

最简单可以直接双击 `index.html` 打开。为了更接近 Vercel 部署环境，也可以在项目目录启动静态服务器：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

首页右侧状态显示“云端已连接 · 实时排行”表示 Supabase 配置正常。若显示“云端未配置 · 本机预览”，页面仍可答题，但排行榜只保存在当前浏览器的 `localStorage`，不属于正式云端排行榜。

## 部署到 Vercel

1. 确认已经运行 `supabase-schema.sql`。
2. 确认 `supabase-config.js` 已填写 Project URL 和 anon public key。
3. 打开 [Vercel](https://vercel.com/)。
4. 新建项目并上传整个项目文件夹，或使用 Vercel CLI 部署。
5. 部署完成后，用 Vercel 生成的网址访问网站。

这是纯静态项目，不需要后端服务，不需要构建命令。Vercel 会直接托管 `index.html`、CSS 和 JS 文件。

## 云端排行榜同步测试

1. 用手机 A 打开 Vercel 网址，输入姓名完成一次答题并提交。
2. 打开 Supabase 后台 `Table Editor`，查看 `quiz_attempts` 表是否出现新记录。
3. 用手机 B 或电脑打开同一个 Vercel 网址，进入排行榜。
4. 确认手机 A 的提交记录出现在排行榜中。
5. 再用手机 B 提交一次，观察手机 A 的排行榜页面是否自动刷新。

如果 Realtime 通道可用，排行榜页面会实时刷新；如果浏览器网络或 Supabase Realtime 配置暂不可用，页面至少会在提交后重新读取排行榜，并在排行榜页尝试定时刷新。

## 判分和排行榜规则

- 每次随机抽取 50 题。
- 每题 2 分，总分 100 分。
- 单选题必须选择唯一答案。
- 多选题严格判分，只有选项完全一致才算正确，少选、多选、错选都不得分。
- 排行榜按 `score` 降序排序。
- 同分时按 `created_at` 升序排序，即更早提交者靠前。
- 排行榜展示每一次答题记录，不按姓名去重。
- 第一、第二、第三名会以奖牌卡片突出展示。

## 常见问题

### 云端未连接

检查 `supabase-config.js` 是否仍是占位符。还要确认填写的是 Project URL 和 anon public key，不是 service_role key。

### 本地预览可以用，部署后排行榜不同步

确认部署到 Vercel 的版本包含已经填写好的 `supabase-config.js`。如果部署前忘记填写，需要重新部署。

### 提交时报 RLS 或 permission denied

重新运行 `supabase-schema.sql`。确认 `quiz_attempts` 表已开启 RLS，并存在 `quiz_attempts_select_all` 和 `quiz_attempts_insert_public` 两条策略。

### 排行榜不实时刷新

确认 `supabase-schema.sql` 最后的 Realtime publication 语句执行成功。如果 Realtime 暂不可用，页面仍会在打开排行榜和提交后重新读取云端数据。

### 手机打不开

确认访问的是 Vercel 的公网 HTTPS 地址，不是电脑本机的 `localhost` 地址。手机和电脑如果不在同一局域网，`localhost` 只能代表手机自己，无法打开电脑上的本地预览。

### 可以删除或修改排行榜记录吗

前端 anon 用户不能更新或删除记录。如需清理测试数据，请用 Supabase 后台管理员界面在 `Table Editor` 中手动操作。
