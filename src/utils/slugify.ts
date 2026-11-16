export const MAX_SLUG_LENGTH = 150;

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
