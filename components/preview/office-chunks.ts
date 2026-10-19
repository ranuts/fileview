/** The ranuts MessageCodec wire format uses 16 KiB binary strings, not base64. */
export async function* encodeOfficeChunks(file: File, signal: AbortSignal) {
  const chunkSize = 16 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    signal.throwIfAborted();
    const buffer = await file.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize).arrayBuffer();
    signal.throwIfAborted();
    yield {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      totalChunks,
      chunkIndex,
      data: String.fromCharCode(...new Uint8Array(buffer)),
    };
  }
}
