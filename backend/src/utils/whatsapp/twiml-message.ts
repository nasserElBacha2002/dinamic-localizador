export function extractMessageFromTwiml(twiml: string): string {
  const match = /<Message>([\s\S]*?)<\/Message>/i.exec(twiml);
  if (!match) {
    return twiml.trim();
  }

  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
