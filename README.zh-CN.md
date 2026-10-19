# @ranui/preview

[English](README.md) | [中文](README.zh-CN.md)

浏览器自定义元素形式的 PDF 和 Office 预览组件。PDF 在本地渲染；Office
文件交给可配置的文档编辑器 iframe。组件本身不要求应用账户或转换服务端。

## 安装和自动注册

```sh
npm install @ranui/preview@0.2.0
```

```ts
import '@ranui/preview';
await customElements.whenDefined('r-preview');
```

```html
<r-preview src="/reports/annual.pdf" label="打开年度报告">打开报告</r-preview>
```

给已连接的元素设置 `src` 会立即打开弹窗；关闭后点击触发元素可以重新打开。
跨域文件需要文件服务器允许 CORS。Blob URL 必须带有支持的 MIME 类型；替换
文件或销毁所属页面时，调用方应释放自己创建的对象 URL。

## 手动注册与 Vue

手动入口导入时不注册任何自定义元素，可以在 SSR 环境中导入。请在客户端注册，
并等待注册完成后设置元素的 JavaScript 属性：

```ts
import { registerPreview } from '@ranui/preview/manual';
await registerPreview('app-file-preview'); // 默认名称为 r-preview
```

```html
<app-file-preview src="/slides/deck.pptx" readonly>查看演示文稿</app-file-preview>
```

Vue 项目还需要让模板编译器识别这个原生自定义元素，在客户端启动或
`onMounted` 中完成注册：

```ts
// vite.config.ts，使用 @vitejs/plugin-vue
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'app-file-preview' } } });
```

原有 `import { preview } from '@ranui/preview'` 命名空间、
`@ranui/preview/preview` 入口和 UMD 的 `ranui.preview` 保持可用。

## API

| 属性                  | 默认值                      | 行为                                                                          |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `src`                 | 无                          | PDF、DOCX、PPTX、XLSX、XLS 文件 URL；赋值后打开预览                           |
| `baseUrl` / `baseurl` | `https://edit.chaxus.com`   | Office 编辑器页面地址，可以带路径和查询参数                                   |
| `readonly`            | false                       | 显式启用 Office 只读模式；空属性或 JS 属性 true 启用，`readonly="false"` 关闭 |
| `closeable`           | 启用                        | `closeable="false"` 隐藏关闭按钮，同时禁用 Escape 关闭                        |
| `label`               | 触发元素文字或 Preview file | 触发元素的无障碍名称                                                          |

`src`、`label`、`baseUrl`、`closeable` 保留原来的字符串属性约定；新增的
`readonly` 是布尔 JavaScript 属性。注册完成前可以使用 HTML 属性。
元素升级完成后可调用 `showPreview()` 和 `closePreview()`。

PDF 所有页面绘制完成，或 Office 编辑器确认打开成功后，触发一次 `load`。
下载、格式或编辑器错误触发一次 `error`，其 `detail` 为错误对象。
两个事件都可以冒泡并穿过 Shadow DOM。替换来源、关闭、移除元素会取消
当前操作，旧操作不会再发完成事件。每个实例独立管理弹窗、iframe 和 worker。

弹窗支持 Enter/空格打开、Escape 关闭、关闭按钮自动聚焦、关闭后恢复焦点、
可见键盘焦点标识，并适配移动端动态视口与安全区域。

## Office 编辑器与只读模式

Office 渲染由 iframe 部署负责。当前
[document 项目](https://github.com/ranuts/document) 提供 `document:*` 嵌入接口。
组件先用 `document:get-state` 检测，再用 `document:open-file` 传递浏览器
`File` 和 `readonly` 配置，等待相同请求 ID 的 `document:opened` 或
`document:error`。只接受目标 iframe 和配置源站的响应。

原来使用 `RENDER_OFFICE` 分块协议的自托管部署，在默认可编辑模式下继续
兼容。旧编辑器没有只读接口时，不能保证真正只读，因此请求只读会明确提示
升级部署。预览过程中修改 `readonly` 会按新的模式重新打开原文件。
只读约束的是编辑器的编辑行为，无法阻止拥有文件的用户下载或复制内容。

## 内网和离线部署

- **PDF：** 部署完整 `dist`。PDF.js API、worker 和
  `dist/pdfjs/{cmaps,standard_fonts,wasm}` 均从本地加载，不请求 PDF CDN。
  保留相对目录结构；若打包器移动了 JavaScript，也需要将 `pdfjs/` 放到
  输出的 ES 入口旁边，UMD 则放到 `umd/` 的上一级。
- **Office：** 将 document 编辑器的完整静态产物部署到内网，包括 WASM
  引擎、Office 编辑器脚本、字体及其他资产，再设置
  `baseUrl="https://office.internal.example/editor"`。
  `baseUrl` 是编辑器页面地址，不能只填 WASM 文件地址；组件不会替你复制
  或代理编辑器依赖。纯静态部署可以运行，不需要额外的文件转换后端。
- 预览页面、文件和编辑器资产都需要在内网 HTTP(S) 环境可达，允许 iframe
  嵌入和所需的 CORS 请求。PDF worker 的 CSP 需要允许 `worker-src blob:`，
  WASM 使用 `application/wasm` MIME；编辑器自身的 CSP 需另行配置。
- 远程 Office `baseUrl` 对应的 iframe 可以访问传入的文件；文件不能离开
  内网时，应使用自己的内网编辑器部署。

PDF 预览不会创建 Office iframe；仅注册组件、放置未打开的组件，也不会
请求默认远程 Office 地址。

## 兼容与迁移

0.2.0 保留自动注册和现有 URL 属性，新增可选手动注册和只读模式。PDF.js
由内置 3.2 升至 6.4，修复页码、重复页面、完成时机、失败处理和 worker 清理。
CI 验证当前 Chromium、Firefox、WebKit；新引擎不再沿用未经验证的
Chrome 88 / Safari 14 支持声明。开发和构建工具要求 Node.js 24+。

如果旧项目仍使用 `https://ranuts.github.io/document`，请换成最终编辑器
地址。跨域跳转与固定源站的 iframe 通信不兼容。

## 开发与发布

```sh
pnpm install --frozen-lockfile # pnpm 11.6.0，Node 24+
pnpm exec playwright install
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
pnpm test:package
```

包验证会在隔离目录安装实际 tarball，检查严格 TypeScript、手动入口 SSR、
公开入口和 PDF 资产。GitHub CI 执行浏览器回归与包验证。
发布正式 GitHub Release `v0.2.0` 后，发布流程会验证并发布同一个 tarball。
npm 可信发布配置为包 `@ranui/preview`、仓库 `ranuts/fileview`、工作流
`release.yml`、环境 `npm`，并允许直接 `npm publish`。

变更见 [CHANGELOG.md](CHANGELOG.md)，许可证为 [AGPL-3.0](LICENSE)。
