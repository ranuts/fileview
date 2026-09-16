# @ranui/preview

[English](README.md) | [中文](README.zh-CN.md)

一个功能强大的文件预览组件库，支持 PDF 和 Office 文档（DOCX、PPTX、XLSX、XLS）的预览，具有现代化的 Web 界面。

## 功能特性

- 📄 **PDF 预览**: 完整的 PDF 文档渲染，支持缩放和导航
- 📊 **Office 文档**: 支持 Microsoft Office 格式
  - Word 文档 (DOCX)
  - PowerPoint 演示文稿 (PPTX)
  - Excel 电子表格 (XLSX, XLS)
- 🎨 **现代化 UI**: 简洁响应式设计，包含加载状态
- 🔧 **可定制**: 支持不同使用场景的配置选项
- 🚀 **轻量级**: 优化的包大小，提供更好的性能
- 🛡️ **TypeScript**: 完整的 TypeScript 支持和类型定义

## 安装

```bash
npm install @ranui/preview
# 或
pnpm add @ranui/preview
# 或
yarn add @ranui/preview
```

## 快速开始

### 基础用法

```html
<!DOCTYPE html>
<html>
  <head>
    <title>文件预览演示</title>
  </head>
  <body>
    <input type="file" id="fileInput" />
    <r-preview id="preview"></r-preview>

    <script type="module">
      import '@ranui/preview';

      const fileInput = document.getElementById('fileInput');
      const preview = document.getElementById('preview');

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          preview.setAttribute('src', url);
        }
      });
    </script>
  </body>
</html>
```

### 编程式用法

```javascript
import { preview } from '@ranui/preview';

// 组件会自动注册为自定义元素
// 现在可以在 HTML 中使用 <r-preview>
```

## API 参考

### 自定义元素：`<r-preview>`

#### 属性

| 属性        | 类型    | 默认值                    | 描述                         |
| ----------- | ------- | ------------------------- | ---------------------------- |
| `src`       | string  | -                         | 要预览的文件 URL 或 blob URL |
| `closeable` | boolean | false                     | 是否显示关闭按钮             |
| `baseUrl`   | string  | 'https://edit.chaxus.com' | Office 文档渲染的基础 URL    |
| `label`     | string  | -                         | 预览的自定义标签             |

#### 方法

| 方法             | 描述             |
| ---------------- | ---------------- |
| `showPreview()`  | 手动触发预览显示 |
| `closePreview()` | 关闭预览模态框   |

#### 事件

| 事件    | 描述               |
| ------- | ------------------ |
| `load`  | 文件成功加载时触发 |
| `error` | 文件加载失败时触发 |

#### 迁移说明（≤ 0.0.1-alpha-3 的旧版本）

旧版本的 `baseUrl` 默认指向 `https://ranuts.github.io/document`，该地址现在只剩一个跳转页——iframe 跨域跳转后 postMessage 会被浏览器丢弃，Office 预览会一直停在加载中。请升级到 `0.1.0-alpha-1` 及以上；如果暂时无法升级，请显式设置属性：

```html
<r-preview src="..." baseUrl="https://edit.chaxus.com"></r-preview>
```

### 支持的文件类型

- **PDF**: `application/pdf`
- **Word**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **PowerPoint**: `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- **Excel**:
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX)
  - `application/vnd.ms-excel` (XLS)

## 开发

### 环境要求

- Node.js >= 23.10.0
- pnpm (推荐)

### 设置

```bash
# 克隆仓库
git clone https://github.com/ranuts/fileview.git
cd fileview

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 运行测试
pnpm test
```

### 脚本命令

- `pnpm dev` - 启动开发服务器，支持热重载
- `pnpm build` - 构建生产版本
- `pnpm test` - 运行测试套件
- `pnpm test:ui` - 使用 UI 运行测试
- `pnpm test:report` - 显示测试报告

## 浏览器支持

- Chrome >= 88
- Firefox >= 85
- Safari >= 14
- Edge >= 88

## 许可证

AGPL-3.0 许可证 - 详情请查看 [LICENSE](LICENSE) 文件。

## 贡献

1. Fork 该仓库
2. 创建你的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m '添加一些很棒的特性'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

## 相关项目

- [ranui](https://github.com/ranuts/ranui) - 现代化 UI 组件库
- [ranuts](https://github.com/ranuts/ranuts) - 工具库

## 支持

如果你遇到任何问题或有疑问，请在 GitHub 上[提交 issue](https://github.com/ranuts/fileview/issues)。
