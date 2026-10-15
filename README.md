# 轻衣橱

本地电子衣橱，数据只存在你的手机里。**国内完整免费版**（无限去背景 / 智能搭配 / 备份导出）。海外 freemium 试点见 [Closet Lite](https://github.com/Zenty-Me/closet-lite)。


灵感来自电子衣橱类产品，**轻衣橱** 是完全本地优先的开源 PWA（亦可打成 Android APK）：拍照建档、搭配组合、穿着日历，无需注册、无服务器、无云同步。

## 在手机上打开（PWA）

1. 用手机浏览器访问：  
   **https://zenty-me.github.io/qing-yichu/**
2. 建议使用 Safari（iOS）或 Chrome（Android）。

### 添加到主屏幕

- **iPhone（Safari）**：分享 →「添加到主屏幕」
- **Android（Chrome）**：菜单 →「添加到主屏幕」/「安装应用」

## Android APK（Capacitor）

本仓库已接入 **Capacitor Android**。本机若无 Android SDK，不能在此直接产出 APK；请在带 Android Studio 的电脑上构建：

```bash
npm install
npm run android:sync    # fetch 去背景模型 + VITE_BASE=/ 构建 + cap sync
npm run android:open    # 打开 Android Studio → Build → Build APK(s)
```

- Web `base`：Pages 用 `/qing-yichu/`；原生用 `/`（`npm run build:native`）。
- GitHub Actions 工作流 `android-debug.yml`（workflow_dispatch / 相关路径 push）可打 **debug APK** 并上传 Artifact，无需签名密钥。
- PWA 安装与 Capacitor APK 并存：PWA = 浏览器安装；APK = 系统应用，离线壳更完整。

## 功能摘要

| 模块 | 能力 |
|------|------|
| **衣橱** | 分组/网格、子分类、色块筛选、批量导入与多选编辑 |
| **单品** | 详情页、多图、适合温度、状态、自定义色（色块 / 取色器 / 照片取色） |
| **图片** | 旋转裁剪；去背景（Web Worker + 输入缩小 + 进度/空闲预热）优先 `public/bg-removal`（isnet_quint8 ≈76MB），缺失时回退 CDN；原生端不回退 CDN |
| **搭配 / 灵感 / 日历 / 我的** | 搭配拼图、灵感、穿着记录、备份 JSON v5、回收站 |

## 去背景模型（自托管）

```bash
npm run fetch:bg-removal   # 下载并裁剪到 public/bg-removal/（约 76MB，不进 git）
```

- 脚本：`scripts/fetch-bg-removal.mjs`（仅 `isnet_quint8` + ONNX WASM）
- 大文件在 `.gitignore`；**Pages 部署**会在 CI 里自动 fetch
- 首次「去背景」优先同源路径；若无本地资源则回退 `staticimgly.com`

## 本地开发

```bash
npm install
npm run fetch:bg-removal   # 可选，本地测去背景
npm run dev
npm run build              # Pages 构建（base=/qing-yichu/）
```

## 隐私

全部数据在浏览器 / App **IndexedDB**。换机前请在「我的」导出备份。

## License

MIT（去背景模型遵循 IMG.LY `@imgly/background-removal-data` 许可，见其文档）
