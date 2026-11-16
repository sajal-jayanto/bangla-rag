export interface ChunkOptions {
  maxChars: number;
  overlap: number;
}

const DEFAULT_OPTIONS: ChunkOptions = { maxChars: 1000, overlap: 150 };

const SEGMENT_BOUNDARY = /(?<=\n\n|\n|[।?!.])\s+/u;

const hardSplit = (piece: string, max: number): string[] => {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    const space = rest.lastIndexOf(" ", max);
    const cut = space > max / 2 ? space : max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
};

const tail = (chunk: string, overlap: number): string => {
  if (overlap <= 0 || chunk.length <= overlap) return "";
  const start = chunk.indexOf(" ", chunk.length - overlap);
  return start === -1 ? "" : chunk.slice(start + 1);
};

export const chunkText = (text: string, options: Partial<ChunkOptions> = {}): string[] => {
  const { maxChars, overlap } = { ...DEFAULT_OPTIONS, ...options };
  const segments = text
    .split(SEGMENT_BOUNDARY)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => hardSplit(s, maxChars - overlap));

  const chunks: string[] = [];
  let current = "";
  for (const segment of segments) {
    const candidate = current ? `${current} ${segment}` : segment;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    const carried = tail(current, overlap);
    current = carried ? `${carried} ${segment}` : segment;
  }
  if (current) chunks.push(current);
  return chunks;
};
