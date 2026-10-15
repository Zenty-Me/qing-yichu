# CLAUDE.md — 轻衣橱 (qing-yichu)

给后续 Claude / 自动化代理用的项目说明。改代码前先读本文件与 `DESIGN.md`。

## Product

- **Name:** 轻衣橱  
- **Tagline:** 本地电子衣橱，数据只存在你的手机里  
- **Inspiration:** 无忧衣橱类 digital closet，**不要**抄商标；视觉为 **white minimal + system blue**（见 DESIGN.md）  
- **Audience:** 手机浏览器 / 可安装 PWA  
- **Privacy:** 完全本地优先；无账号、无后端、无云同步  

## URLs

| | |
|--|--|
| Repo | https://github.com/Zenty-Me/qing-yichu |
| Live Pages | https://zenty-me.github.io/qing-yichu/ |
| Owner | GitHub user `Zenty-Me` |

## Stack

- Vite + React + TypeScript  
- `vite-plugin-pwa`（manifest + service worker）  
- `idb` → IndexedDB  
- React Router **`HashRouter`**（适配 GitHub Project Pages）  
- Vite `base`：`VITE_BASE` 或默认 `/qing-yichu/`；原生 `/`  
- Deploy: `.github/workflows/deploy.yml` → GitHub Pages (Actions)  

## Architecture

```
src/
  pages/        # 衣橱、单品详情/表单、搭配、灵感、日历、我的、回收站
  components/   # BottomNav、ItemCard、ImageEditor、BatchEditSheet…
  db/index.ts   # IndexedDB 封装（当前 DB_VERSION = 9）
  types/        # 领域类型 + normalize* + BackupData v1–v5（颜色已存 hex）
  utils/        # image / cutout / settings / wearStats / suggest / wardrobeQuery…
  hooks/        # useBlobUrl
```

### IndexedDB (`qing-yichu`)

| Version | Change |
|---------|--------|
| 1 | stores: `items`, `outfits`, `wearLogs` |
| 2 | + `inspirations` |
| 3 | soft fields: `originalBlob`（单品）、`coverBlob`（搭配）；`normalize*` |
| 4 | `extraImages[]`、`tempMin`/`tempMax`、`status`；分类增「连衣裙」；UI 别名上装/下装 |
| 5 | `subcategory` 字符串；自定义子分类 taxonomy 在 settings / 备份 v5 |
| 6 | `color` 存 hex；旧中文色名经 `normalizeColorHex` 迁移 |
| 7 | `wishlist` store；单品 `needsWash`；备份 v6 含想买 |
| 8 | `purchaseLink`；衣橱估值 / 购物深链 |
| 9 | `wearLog.spend` 今日花费；换季提醒；CSV 导出；ROI/搭配成本 |
| 10 | `seasons[]` multi-select |
| 11 | `appMeta` store — monthly cutout/outfit quotas |

Stores: `items`, `outfits`, `wearLogs`, `inspirations`, `wishlist`, `appMeta`. Soft-delete via `deletedAt`.

Overseas pilot: see `docs/overseas-pilot.md` (i18n zh/en, quotas, Pro flag, Stripe stubs).

### Backups（我的 → 导出/导入）

- Export **v6**（含 `subcategory` + `subcategoryTaxonomy`）  
- Import accepts **v1–v6**  

Settings（季节模式等）在 **localStorage** `qing-yichu-settings`；衣橱视图模式在 `qing-yichu-wardrobe-view`（`grouped` | `grid`）。

## Features already shipped

- **衣橱:** 分类分节 + 横向滑动（无顶部分类 Tab；空分类隐藏）；排序 / 更多筛选（颜色·季节）；顶栏搜索 / 更多（选择、季节模式、批量导入）；FAB 添加；批量导入 ≤30、多选批量改属性 / 回收站；单品图可旋转 / 自由比例裁剪 / 去背景  
- **单品详情** `/items/:id`：大方图、「更多图片」画廊、属性行点选编辑（名称/分类/颜色色点/季节/适合温度/收纳/状态 pill）；底栏 创建搭配 | 日历 | 复制 | 删除；完整表单在 `/items/new` 与 `/items/:id/edit`  
- **图片:** 旋转裁剪、CDN 去背景、`originalBlob`；多图 `extraImages`  
- **搭配 / 灵感 / 日历 / 我的 / 回收站:** 同前；从详情「创建搭配」可 `?item=` 预填；「日历」可 `?item=` 打开记录并预选单品  

## Design system（必守）

详见 `DESIGN.md`。**禁止**紫色 AI SaaS；**禁止**退回 linen/olive 纸感。

- Canvas `#F2F2F2` · surface `#FFFFFF` · ink `#1A1A1A` · muted `#8E8E93` · line `#E5E5EA`  
- Accent **system blue** `#3478F6` · soft `#E8F0FE` · success `#34C759`  
- Type: Noto Sans SC / PingFang only  
- 照片优先；**调色盘锁定**，优化密度/字重/描边；无阴影卡片堆；FAB 无光晕；chip 描边/浅底  


## Run / deploy

```bash
cd /workspace/qing-yichu
npm install
npm run build              # must pass before push
```

Push `main` → Actions → https://zenty-me.github.io/qing-yichu/  
（旧 SW 时硬刷新。）

## Conventions

- **UI copy:** 中文；产品名「轻衣橱」；分类存储键用 `CATEGORIES`，展示用 `CATEGORY_LABEL`（上衣→上装、裤子→下装）  
- **Routes:** 详情与创建/编辑分离：`items/:id` vs `items/new` / `items/:id/edit`  
- **Migrations:** 升 `DB_VERSION`；`normalize*` 默认新字段；备份升版本且能 import 旧版  
- **Heavy libs:** dynamic import / CDN，勿把大 WASM 打进 Pages  
- **No backend** unless product changes  
- Claude Code：`.claude/settings.json` 用 acceptEdits + allow；`bypassPermissions` 仅用户级生效  

## Quick try — 分组衣橱 + 单品详情

1. 打开衣橱：默认「分组」；左上角图标切到「网格」  
2. 点分类里缩略图 → 单品详情；点属性行改字段；「更多图片」加附图  
3. 详情底栏：创建搭配 / 日历 / 复制 / 删除  
4. 更多菜单：选择、季节模式、批量导入  
