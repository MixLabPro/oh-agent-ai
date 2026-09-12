# Workbench UI 开发

## 快速开始

```bash
cd apps/desktop/ui-dev
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/workbench.html`，Vite 会从 `../src-tauri/ui` 提供
Workbench 页面，并注入 `public/tauri-mock.js`。mock 只用于浏览器中的演示数据和
交互检查，不会写入本机 Authority 数据库。

## 回归检查

```bash
npm run verify
```

该命令先执行 production build，再运行当前 Workbench closeout verifier。样式或
交互修改在开发服务中确认后，仍需用 Tauri 构建和可操作的 `.app` 做原生 IPC、
文件权限、菜单栏、系统通知及安装升级验收。

Vite mock 验收不能替代真实 `.app` Computer Use、签名/公证或外部试用门槛。
