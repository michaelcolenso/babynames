/*
 * This script's truncateDescription() caused the mid-word teaser cuts on
 * /blog/ ("inven...", "backgro..."). The truncation logic now prefers a
 * sentence boundary and never cuts inside a word.
 */
PLACEHOLDER