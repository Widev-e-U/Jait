export const INLINE_IMAGE_TYPE = /^image\/(png|jpeg|gif|webp|avif)$/i;
export function embedInlineImages(html: string, images: Map<string, string>): string {
  return html.replace(/cid:([^"'<>\s]+)/gi, (original, cid: string) => {
    try { return images.get(decodeURIComponent(cid).replace(/^<|>$/g, "")) || original; }
    catch { return original; }
  });
}
export function inlineImageData(type: string, data: string): string | null {
  if (!INLINE_IMAGE_TYPE.test(type) || data.length > 1_500_000 || !/^[a-zA-Z0-9+/_=-]+$/.test(data)) return null;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > 1024 * 1024) return null;
  return `data:${type.toLowerCase()};base64,${bytes.toString("base64")}`;
}
