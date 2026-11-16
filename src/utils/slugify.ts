export const MAX_SLUG_LENGTH = 150;

/**
 * Lowercases and joins words with "-". Keeps letters, combining marks and digits from any
 * script, so Bangla names (e.g. "আমার প্রকল্প" → "আমার-প্রকল্প") keep their text.
 */
export const slugify = (text: string): string => {
  const slug = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug || "project";
};
