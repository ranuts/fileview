# @ranui/preview

[English](README.md) | [中文](README.zh-CN.md)

A powerful file preview component library that supports PDF and Office documents (DOCX, PPTX, XLSX, XLS) with a modern web interface.

## Features

- 📄 **PDF Preview**: Full PDF document rendering with zoom and navigation
- 📊 **Office Documents**: Support for Microsoft Office formats
  - Word documents (DOCX)
  - PowerPoint presentations (PPTX)
  - Excel spreadsheets (XLSX, XLS)
- 🎨 **Modern UI**: Clean and responsive design with loading states
- 🔧 **Customizable**: Configurable options for different use cases
- 🚀 **Lightweight**: Optimized bundle size for better performance
- 🛡️ **TypeScript**: Full TypeScript support with type definitions

## Installation

```bash
npm install @ranui/preview
# or
pnpm add @ranui/preview
# or
yarn add @ranui/preview
```

## Quick Start

### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>File Preview Demo</title>
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

### Programmatic Usage

```javascript
import { preview } from '@ranui/preview';

// The component is automatically registered as a custom element
// You can now use <r-preview> in your HTML
```

## API Reference

### Custom Element: `<r-preview>`

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `src` | string | - | File URL or blob URL to preview |
| `closeable` | boolean | false | Whether to show close button |
| `baseUrl` | string | 'https://ranuts.github.io/document' | Base URL for Office document rendering |
| `label` | string | - | Custom label for the preview |

#### Methods

| Method | Description |
|--------|-------------|
| `showPreview()` | Manually trigger preview display |
| `closePreview()` | Close the preview modal |

#### Events

| Event | Description |
|-------|-------------|
| `load` | Fired when file is successfully loaded |
| `error` | Fired when file loading fails |

### Supported File Types

- **PDF**: `application/pdf`
- **Word**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **PowerPoint**: `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- **Excel**: 
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX)
  - `application/vnd.ms-excel` (XLS)

## Development

### Prerequisites

- Node.js >= 23.10.0
- pnpm (recommended)

### Setup

```bash
# Clone the repository
git clone https://github.com/ranuts/fileview.git
cd fileview

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

### Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm test` - Run test suite
- `pnpm test:ui` - Run tests with UI
- `pnpm test:report` - Show test report

## Browser Support

- Chrome >= 88
- Firefox >= 85
- Safari >= 14
- Edge >= 88

## License

AGPL-3.0 License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Related Projects

- [ranui](https://github.com/ranuts/ranui) - Modern UI component library
- [ranuts](https://github.com/ranuts/ranuts) - Utility library

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/ranuts/fileview/issues) on GitHub. 