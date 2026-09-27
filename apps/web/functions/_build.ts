// Deploy identifier folded into the middleware's variant-cache key, so each
// deploy starts from a cold cache instead of serving the previous build's
// HTML for up to a week (name pages s-maxage=1d, year pages 7d).
// `npm run deploy:web` overwrites this file with the commit SHA
// (scripts/stamp-build-id.mjs) before `wrangler pages deploy`; the committed
// value, used by local dev and tests, is "dev".
export const BUILD_ID = "dev";
