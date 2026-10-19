declare module '*.less' {
  const stylesheet: string;
  export default stylesheet;
}
declare module '*.less?inline' {
  const stylesheet: string;
  export default stylesheet;
}
declare module '*?raw' {
  const source: string;
  export default source;
}
declare const __FILEVIEW_PDF_ASSET_BASE__: string;
