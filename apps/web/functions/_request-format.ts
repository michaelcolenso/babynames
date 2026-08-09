import { prefersMarkdown } from "./_accept";

/**
 * Return true when a request should receive the machine-readable homepage.
 *
 * Fetch Metadata identifies top-level navigations. The User-Agent fallback
 * covers browsers whose extensions or privacy proxies strip that metadata and
 * rewrite Accept to prefer Markdown.
 */
export function shouldServeMarkdown(request: Request): boolean {
  const destination = request.headers.get("Sec-Fetch-Dest")?.toLowerCase();
  const mode = request.headers.get("Sec-Fetch-Mode")?.toLowerCase();
  const userAgent = request.headers.get("User-Agent") ?? "";

  if (
    destination === "document" ||
    mode === "navigate" ||
    /^Mozilla\/5\.0\b/i.test(userAgent.trim())
  ) {
    return false;
  }

  return prefersMarkdown(request.headers.get("Accept"));
}
