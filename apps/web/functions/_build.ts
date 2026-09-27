// Deploy identifier folded into the middleware's variant-cache key, so each
// deploy starts from a cold cache instead of serving the previous build's
// HTML for up to a week (name pages s-maxage=1d, year pages 7d). The deploy
// workflow overwrites this file with the commit SHA before `wrangler pages
// deploy`; local dev keeps "dev".
export const BUILD_ID = "dev";
