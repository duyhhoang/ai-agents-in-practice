export type TextChunk = {
  index: number;
  text: string;
};

/**
 * Splits text into logical chunks (paragraphs / section windows) of approximately `maxChunkSize` characters,
 * respecting paragraph and sentence boundaries.
 */
export function chunkText(text: string, maxChunkSize = 500, overlap = 100): TextChunk[] {
  if (!text || !text.trim()) return [];

  const cleanText = text.trim();
  if (cleanText.length <= maxChunkSize) {
    return [{ index: 0, text: cleanText }];
  }

  // Split into paragraphs first
  const rawParagraphs = cleanText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: TextChunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of rawParagraphs) {
    if (para.length > maxChunkSize) {
      // Flush existing chunk if any
      if (currentChunk.trim()) {
        chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
        currentChunk = "";
      }

      // Split long paragraph by sentences
      const sentences = para.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [para];
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize && currentChunk.trim()) {
          chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
          // Add overlap from previous chunk
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + sentence;
        } else {
          currentChunk += sentence;
        }
      }
    } else {
      if ((currentChunk + "\n\n" + para).length > maxChunkSize && currentChunk.trim()) {
        chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + "\n\n" + para;
      } else {
        currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
  }

  return chunks;
}
