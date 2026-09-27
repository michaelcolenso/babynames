// Writes apps/web/functions/_build.ts with the commit being deployed, so the
// middleware's variant cache starts cold on every deploy. Run by
// `npm run -w @nv/web deploy` right before `wrangler pages deploy`.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let sha = process.env.GITHUB_SHA || "";
if (!sha) {
  try {
    sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    sha = `local-${Date.now()}`;
  }
}
const id = sha.slice(0, 12);
const out = fileURLToPath(new URL("../apps/web/functions/_build.ts", import.meta.url));
writeFileSync(
  out,
  `// Deploy identifier folded into the middleware's variant-cache key. Written by\n// scripts/stamp-build-id.mjs at deploy time; the committed value is "dev".\nexport const BUILD_ID = ${JSON.stringify(id)};\n`,
);
console.log(`BUILD_ID=${id}`);
