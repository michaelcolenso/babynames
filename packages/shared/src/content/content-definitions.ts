// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type { ContentDefinition } from "./factory-types";

function findPeak(
  members: Array<{ name: string; sex: string; peakCount: number }>,
  name: string,
): number {
  const hit = members.find((m) => m.name === name);
  if (!hit) throw new Error(`flash-floods: expected member "${name}" not detected in data`);
  return hit.peakCount;
}

export const CONTENT_DEFINITIONS: ContentDefinition[] = [
  {
    slug: "flash-floods",
    kind: "both",
    title: "The Flash Floods — American Names That Arrived All at Once",
    description:
      "175 names surged from nowhere to a peak and collapsed within five years. These are the flash floods of American naming — cultural timestamps crystallized in birth records.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "flash-floods", minPeak: 100 },
    claims: {
      count: (m) => m.length,
      femalePct: (m) =>
        Math.round((m.filter((x) => x.sex === "F").length / m.length) * 100),
      topName: (m) => m[0]?.name ?? "none",
      topCount: (m) => m[0]?.peakCount ?? 0,
      topYear: (m) => m[0]?.peakYear ?? 0,
      kuntaCount: (m) => findPeak(m, "Kunta"),
      arsenioCount: (m) => findPeak(m, "Arsenio"),
      moeshaCount: (m) => findPeak(m, "Moesha"),
      jkwonCount: (m) => findPeak(m, "Jkwon"),
      bethzyCount: (m) => findPeak(m, "Bethzy"),
      kizzyCount: (m) => findPeak(m, "Kizzy"),
      kanyeCount: (m) => findPeak(m, "Kanye"),
      aadenCount: (m) => findPeak(m, "Aaden"),
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      // If the underlying data changes, the build fails and the copy gets reviewed.
      { key: "kuntaCount", equals: 215 },
      { key: "arsenioCount", equals: 397 },
      { key: "moeshaCount", equals: 426 },
      { key: "jkwonCount", equals: 100 },
      { key: "bethzyCount", equals: 301 },
      { key: "kizzyCount", approx: [1117, 2] },
      { key: "kanyeCount", approx: [509, 2] },
      { key: "aadenCount", approx: [1269, 2] },
    ],
  },
];
