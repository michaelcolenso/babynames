/**
 * Return true only when Markdown is explicitly preferred to HTML.
 *
 * Browser extensions and agent-capable browsers may advertise both media
 * types. Treating the mere presence of `text/markdown` as an instruction to
 * replace the visual site makes ordinary navigations render as raw text.
 */
export function prefersMarkdown(accept: string | null): boolean {
  let markdownQuality: number | undefined;
  let htmlQuality: number | undefined;

  for (const range of (accept ?? "").split(",")) {
    const [rawType, ...parameters] = range.split(";");
    const type = (rawType ?? "").trim().toLowerCase();
    if (type !== "text/markdown" && type !== "text/html") continue;

    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*$/i.exec(parameter);
      if (match) quality = Number(match[1]);
    }

    if (type === "text/markdown") markdownQuality = Math.max(markdownQuality ?? 0, quality);
    if (type === "text/html") htmlQuality = Math.max(htmlQuality ?? 0, quality);
  }

  return markdownQuality !== undefined && markdownQuality > 0 &&
    (htmlQuality === undefined || markdownQuality > htmlQuality);
}
