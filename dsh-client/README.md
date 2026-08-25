# dsh-skill-vitals-audit — out-of-tree DSH audit plugin

双面插件：

- **宿主半份**（`index.js`）——注册 `behaviorFindings` 与 `tokenByModel` 两个
  session projection。宿主是 projection push 模型里唯一的计算端：`behaviorFindings`
  把原始 session 事件（`tool/call`、`approval/asked`、`sandbox/mode`…）喂给 Rust
  行为规则（编译成 wasm，`skill_vitals_wasm_bg.wasm`）算出 SV601–SV610 findings；
  `tokenByModel` 把 usage 事件喂给同一份 core 的 `token_by_model`（wasm）算出按
  模型分桶的 token 报告——CLI 的 `behavior` 命令走的是**同一份引擎**，never a
  second copy。
- **客户端半份**（`client.js`）——在 Web GUI 会话视图的「审计」tab 里读
  `useProjection('behaviorFindings')`、`useProjection('tokenUsage')` 与
  `useProjection('tokenByModel')`，渲染「成本（token + 价格估算）+ 风险（行为
  findings）」两层数据。价格估算 = 按模型分桶的 token × DeepSeek 官方报价
  （flash/pro × 空闲/高峰），分桶来自 wasm `token_by_model`（snake_case），各桶
  之和与 `tokenUsage` 严格相等；价格表单一真相源是 `scripts/skill_vitals/pricing.json`，
  这里的 PRICING 是其内嵌副本（`tests/test_pricing_lockstep.py` 守）。

浏览器拿不到原始执行事件（client `SessionFace` 只暴露投影，不暴露 raw log，
approval/sandbox 是 log-only 事件不进投影），所以计算必须落在宿主侧——这正是
wasm 跑在 Node（宿主）而非浏览器的原因。

## 安装与开发循环

**生产**（从 npm registry，`dsh-skill-vitals-audit` 发布后）：

```bash
dsh plugin --profile web add dsh-skill-vitals-audit
```

**开发**（本地改动实时生效，强烈推荐）——用 `link:` 建 symlink，改 `index.js` /
`client.js` 后**不用重装**，重启 `dsh web` 即生效：

```bash
dsh plugin --profile web add link:/Users/Admin/projects/project/skill-vitals/dsh-client
```

> ⚠️ 别用 `file:` 做开发循环。pnpm 的 `file:` 目录依赖是**拷贝 + 按路径缓存**（不按
> 版本），所以改完 bump 版本、`--force` 都拦不住「Already up to date」。若已经用
> `file:` 装了旧版，切回 `link:` 或强制重装：
>
> ```bash
> cd ~/.dsh/profiles/web
> pnpm remove dsh-skill-vitals-audit
> pnpm add link:/Users/Admin/projects/project/skill-vitals/dsh-client   # 或 file:...（一次性）
> ```

## 构建：tsup（zero workspace dependency）

用 `tsup` 而非 DSH 的 tsdown 构建链，原因是 tsdown 的 `tsdown.client.ts` preset
依赖 `workspace:^` peer 解析和 `lightningcss` / `../tsdown.client.ts` 相对导入——
这些只在 deepseek-harness 的 pnpm workspace 里可解析。tsup 的 `external` 直接写
npm 包名，不需要 workspace 协议：

```bash
pnpm build   # 两 Bundle：lib/index.js (host/ESM) + lib/client.cjs (browser/CJS)
```

- **Host**：`src/host/index.ts` → `lib/index.js`（ESM, Node, external: zod）
- **Client**：`src/client/index.ts` → `lib/client.cjs`（CJS + `__ModuleLoader__` banner/footer）

## 包结构

```
dsh-client/
├── package.json          # name + dsh.client 清单 + exports
├── tsup.config.ts        # 两条构建：host (ESM/Node) + client (CJS + __ModuleLoader__ handoff)
├── tsconfig.json         # tsconfig for type checking (moduleResolution: Bundler)
├── lib/                  # 构建产物（.gitignore）
│   ├── index.js          # host 半份（sessionProjections 投影 + wasm）
│   └── client.cjs        # 浏览器 bundle（banner/footer 包装的 __ModuleLoader__ handoff）
├── src/
│   ├── host/index.ts     # host 真相源（Zod schema + wasm 调用）
│   ├── wasm-shim.ts      # wasm re-export shim（build 路径兼容）
│   └── client/
│       ├── index.cts     # client bundle 入口 (.cts 避免 "type:module" 包警告)
│       ├── react.ts      # `require('react')` shim（browser module table supply）
│       ├── styles/index.ts # design tokens + pricing + formatters
│       └── components/
│           └── AuditView.tsx  # 审计 tab 主组件（React TSX）
├── legacy/               # 停用的旧实现（手写 JS，已被上述 TS 替代）
└── scripts/verify.mjs    # 零依赖验证
```

## `dsh.client` 清单怎么写

`package.json` 里的声明（`packages/client/modules/src/index.ts` 逐字段校验）：

```json
{
  "name": "dsh-skill-vitals-audit",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
    }
  }
}
```

- `dsh.client.platform` 必须是字符串，等于 `"web"` 才进 Web 入口表（`resolveMeta` 里
  `decl.platform !== 'web'` 即跳过）。
- `dsh.client.inject`（可选，`string[]`）是**包级模块依赖边**：我的 `apply` 往
  `conversation.view` 里注册，而该 slot 由 `@deepseek-ai/dsh-client-ui-conversation`
  的 `conversation.session` 注册声明，所以把它列为依赖边，保证其 bundle 先 materialize。
- `exports["./client"]` 必须是**字符串**或 `{ default: string }`，且是相对路径
  （`clientExportOf` 只接受这两种；扫描器用 `join(dirname(pkgJson), clientRel)` 定位 bundle）。

## `exports["./client"]` 指向哪

`./lib/client.cjs`（tsup 产物）。它的内容是 `__ModuleLoader__` banner/footer 包装：

```js
window.__ModuleLoader__.load({
  id: "dsh-skill-vitals-audit",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ... React bundle body ...
    module.exports = { name: 'dsh-skill-vitals-audit', inject: ['slots', 'locale'], apply }
    return module.exports;
  },
});
```

浏览器侧 `ClientModuleSystem`（`modules/src/client/system.ts`）把 `factory(require)`
的返回值当 `module.exports`，即 `{ apply, inject }` 的 cordis 对象插件。`apply(ctx)` 里：

```js
ctx.slots.inject("conversation.view", () => ctx.slots.register({
  name: "conversation.view",
  id: "audit",
  order: 20,
  label: () => "审计",
  inject: () => ({}),
}, AuditView))
```

运行时唯一的外部依赖是 `react`（`require("react")`），它是平台 seed 词
（`web/src/platform.ts` 的 `PLATFORM_MODULES` + `web/src/seed.ts` 的 `getStaticModules`），
由 shell 冻结进模块表，无需任何跨插件 value 导入。

## 构建结果

```bash
pnpm build   # 或 npm run build
```

tsup 两条构建：host (ESM, `lib/index.js`) + client (CJS, `lib/client.cjs`)。
`node scripts/verify.mjs` 做零依赖验证。

## 安装后能否被 modules 扫到 —— 判断

能。`packages/client/modules/src/index.ts` 的 `ClientModuleRegistry` 扫描逻辑是：

1. `resolveMeta(pkgName)` → `require.resolve('dsh-skill-vitals-audit/package.json')`
   （锚点是 cordis 配置树的 `ctx.baseUrl`，`dsh plugin add` 把包装进 profile 后即可解析）。
2. 读 `pkg.dsh.client`，`platform === 'web'` 通过。
3. `clientExportOf(pkgName, pkg.exports)` 拿到 `"./client"` → `"./client.js"`。
4. `clientPath = join(dirname(pkgJson), "./client.js")` → 本包根目录的 `client.js` 存在。
5. `initialBundleRevision` 读文件算 rev，`graphRow` 产出
   `{ id, url: '/plugins/dsh-skill-vitals-audit/client.js?rev=…', rev }`，加入 `__DSH_BOOT__`
   图；`serveBundle` 路由 `/plugins/<id>/client.js` 返回该文件。

因此：**只要 `dsh plugin add` 把本包装进 profile（并由父代理安装依赖 / 重启验证），
`exports["./client"]` 有产物，modules 扫描器就会把它编进启动图并 serve。** 本 spike 未
执行 `dsh plugin add`、未运行 `dsh web`、未重启任何服务器，按约束留给父代理。

## 已知限制

- `peerDependencies` 用了 `*`（而非 `workspace:^`），因为树外包无法解析 workspace 协议；
  真实安装时需让这些 `@deepseek-ai/*` 包在运行时可见（它们本就随 DSH 安装存在）。
