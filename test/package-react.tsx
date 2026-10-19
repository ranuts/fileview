import type * as React from 'react';
import '@ranui/preview/typings';

const preview: React.JSX.Element = (
  <r-preview src="/sample.pdf" closeable={false} baseUrl="https://example.com" aria-label="Preview file">
    Preview
  </r-preview>
);
void preview;
