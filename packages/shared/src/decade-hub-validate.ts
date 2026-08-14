import type { DecadeProfile } from "./decade-hub-types";
import { DECADE_HUB_METHODOLOGY_VERSION } from "./decade-hub-types";
import type { DecadeHubDefinition } from "./content/decade-hub-definitions";

export type DecadeHubValidationIssueCode =
  | "root-type"
  | "missing-field"
  | "wrong-type"
  | "non-finite-number"
  | "invalid-value"
  | "invalid-date"
  | "decade-mismatch"
  | "coverage-mismatch"
  | "source-version-mismatch"
  | "thesis-source-mismatch"
  | "methodology-version-mismatch"
  | "duplicate-identity"
  | "rank-invalid"
  | "order-invalid"
  | "reconciliation-failed"
  | "classroom-invalid"
  | "family-invalid";

export interface DecadeHubValidationIssue {
  readonly code: DecadeHubValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type DecadeHubValidationResult =
  | { readonly ok: true; readonly profile: DecadeProfile; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly DecadeHubValidationIssue[] };

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateDecadeHubProfile(value: unknown, definition: DecadeHubDefinition): DecadeHubValidationResult {
  const issues: DecadeHubValidationIssue[] = [];
  const add = (code: DecadeHubValidationIssueCode, path: string, message: string) => issues.push({ code, path, message });
  if (!isObject(value)) {
    add("root-type", "$", "decade hub payload must be an object");
    return { ok: false, issues };
  }

  const required = [
    "decade", "startYear", "endYear", "nominalEndYear", "dataThroughYear", "isComplete",
    "totalBirths", "femaleBirths", "maleBirths", "distinctNames", "top10Share", "top100Share",
    "diversityScore", "effectiveNames", "concentrationScore", "femaleChampion", "maleChampion",
    "ownershipRankings", "alpha", "priorDecadeShare", "priorDecadeShareFemale", "priorDecadeShareMale",
    "classroomDefaults", "spellingFamilies", "methodologyVersion", "generatedAt", "sourceVersion",
  ] as const;
  for (const key of required) if (!(key in value)) add("missing-field", `$.${key}`, `required field ${key} is missing`);

  const number = (key: string): number | undefined => {
    const current = value[key];
    if (typeof current !== "number") { if (key in value) add("wrong-type", `$.${key}`, `${key} must be a number`); return undefined; }
    if (!Number.isFinite(current)) { add("non-finite-number", `$.${key}`, `${key} must be finite`); return undefined; }
    return current;
  };
  const integer = (key: string): number | undefined => {
    const current = number(key);
    if (current !== undefined && !Number.isInteger(current)) add("invalid-value", `$.${key}`, `${key} must be an integer`);
    return current;
  };
  const bounded = (key: string, min: number, max: number): number | undefined => {
    const current = number(key);
    if (current !== undefined && (current < min || current > max)) add("invalid-value", `$.${key}`, `${key} must be between ${min} and ${max}`);
    return current;
  };
  const string = (key: string): string | undefined => {
    const current = value[key];
    if (typeof current !== "string") { if (key in value) add("wrong-type", `$.${key}`, `${key} must be a string`); return undefined; }
    return current;
  };

  const decade = integer("decade");
  const startYear = integer("startYear");
  const endYear = integer("endYear");
  const nominalEndYear = integer("nominalEndYear");
  const dataThroughYear = integer("dataThroughYear");
  const totalBirths = integer("totalBirths");
  const femaleBirths = integer("femaleBirths");
  const maleBirths = integer("maleBirths");
  const distinctNames = integer("distinctNames");
  const top10Share = bounded("top10Share", 0, 1);
  const top100Share = bounded("top100Share", 0, 1);
  bounded("diversityScore", 0, 100);
  const effectiveNames = number("effectiveNames");
  bounded("concentrationScore", 0, 100);
  const alpha = number("alpha");
  bounded("priorDecadeShare", 0, 1);
  bounded("priorDecadeShareFemale", 0, 1);
  bounded("priorDecadeShareMale", 0, 1);

  if (decade !== undefined && decade !== definition.startYear) add("decade-mismatch", "$.decade", `payload decade ${decade} does not match ${definition.startYear}`);
  if (startYear !== undefined && startYear !== definition.startYear) add("decade-mismatch", "$.startYear", `payload start ${startYear} does not match ${definition.startYear}`);
  if (nominalEndYear !== undefined && nominalEndYear !== definition.nominalEndYear) add("coverage-mismatch", "$.nominalEndYear", `payload nominal end ${nominalEndYear} does not match ${definition.nominalEndYear}`);
  if (dataThroughYear !== undefined && dataThroughYear < definition.startYear) add("coverage-mismatch", "$.dataThroughYear", `dataThroughYear ${dataThroughYear} is before decade start ${definition.startYear}`);
  if (dataThroughYear !== undefined && endYear !== undefined) {
    const expectedEnd = Math.min(definition.nominalEndYear, dataThroughYear);
    if (endYear !== expectedEnd) add("coverage-mismatch", "$.endYear", `payload end ${endYear} does not match derived end ${expectedEnd}`);
    const complete = endYear === definition.nominalEndYear;
    if (typeof value.isComplete !== "boolean") { if ("isComplete" in value) add("wrong-type", "$.isComplete", "isComplete must be a boolean"); }
    else if (value.isComplete !== complete) add("coverage-mismatch", "$.isComplete", `isComplete must be ${complete}`);
  }

  if (totalBirths !== undefined && femaleBirths !== undefined && maleBirths !== undefined && totalBirths !== femaleBirths + maleBirths) add("reconciliation-failed", "$.totalBirths", "totalBirths must equal femaleBirths + maleBirths");
  for (const [key, current] of [["totalBirths", totalBirths], ["femaleBirths", femaleBirths], ["maleBirths", maleBirths], ["distinctNames", distinctNames], ["effectiveNames", effectiveNames], ["alpha", alpha]] as const) {
    if (current !== undefined && current <= 0) add("invalid-value", `$.${key}`, `${key} must be positive`);
  }
  if (top10Share !== undefined && top100Share !== undefined && top10Share > top100Share) add("invalid-value", "$.top10Share", "top10Share must not exceed top100Share");
  if (effectiveNames !== undefined && distinctNames !== undefined && effectiveNames > distinctNames) add("invalid-value", "$.effectiveNames", "effectiveNames must not exceed distinctNames");

  const methodologyVersion = string("methodologyVersion");
  if (methodologyVersion !== undefined && methodologyVersion !== DECADE_HUB_METHODOLOGY_VERSION) add("methodology-version-mismatch", "$.methodologyVersion", `expected ${DECADE_HUB_METHODOLOGY_VERSION}`);
  const generatedAt = string("generatedAt");
  if (generatedAt !== undefined && !Number.isFinite(Date.parse(generatedAt))) add("invalid-date", "$.generatedAt", "generatedAt must be a valid timestamp");
  const sourceVersion = string("sourceVersion");
  if ("gitCommit" in value && typeof value.gitCommit !== "string") add("wrong-type", "$.gitCommit", "gitCommit must be a string when present");
  const sourceMatch = sourceVersion?.match(/^ssa-national-(\d{4})$/);
  if (sourceVersion !== undefined && !sourceMatch) add("source-version-mismatch", "$.sourceVersion", "sourceVersion must match ssa-national-YYYY");
  else if (sourceMatch && dataThroughYear !== undefined && Number(sourceMatch[1]) !== dataThroughYear) add("source-version-mismatch", "$.sourceVersion", "source version year must equal dataThroughYear");
  if (sourceVersion !== undefined && definition.rolloutState !== "draft" && sourceVersion !== definition.thesisSourceVersion) add("thesis-source-mismatch", "$.sourceVersion", `payload source ${sourceVersion} does not match reviewed thesis source ${definition.thesisSourceVersion}`);

  for (const [key, expectedSex] of [["femaleChampion", "F"], ["maleChampion", "M"]] as const) {
    const champion = value[key]; const path = `$.${key}`;
    if (!isObject(champion)) { if (key in value) add("wrong-type", path, `${key} must be an object`); continue; }
    const name = champion.name; const slug = champion.slug; const sex = champion.sex;
    const births = champion.birthsInDecade; const lifetime = champion.lifetimeBirths;
    if (typeof name !== "string" || !name.trim()) add("invalid-value", `${path}.name`, "champion name must be non-empty");
    if (typeof slug !== "string" || !slug.trim()) add("invalid-value", `${path}.slug`, "champion slug must be non-empty");
    if (sex !== expectedSex) add("invalid-value", `${path}.sex`, `${key} must have sex ${expectedSex}`);
    if (typeof births !== "number" || !Number.isInteger(births) || births <= 0) add("invalid-value", `${path}.birthsInDecade`, "champion decade births must be positive");
    if (typeof lifetime !== "number" || !Number.isInteger(lifetime) || typeof births !== "number" || lifetime < births) add("reconciliation-failed", `${path}.lifetimeBirths`, "champion lifetime births must cover decade births");
  }

  const compareNames = (a: string, b: string) => {
    const al = a.toLowerCase(); const bl = b.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  };
  const rankings = value.ownershipRankings;
  if (!isObject(rankings)) {
    if ("ownershipRankings" in value) add("wrong-type", "$.ownershipRankings", "ownershipRankings must be an object");
  } else {
    const views = ["female", "male", "mostOwned", "mostPopular", "popularButTimeless", "unexpected"] as const;
    for (const view of views) {
      const rows = rankings[view];
      const viewPath = `$.ownershipRankings.${view}`;
      if (!Array.isArray(rows)) { add("wrong-type", viewPath, `${view} must be an array`); continue; }
      if (!rows.length && (view === "female" || view === "male")) add("invalid-value", viewPath, `${view} ranking must not be empty`);
      if (view !== "female" && view !== "male" && rows.length > 25) add("invalid-value", viewPath, `${view} cannot exceed 25 rows`);
      const identities = new Set<string>(); const slugs = new Set<string>();
      const ownershipRanks = new Set<number>(); const popularityRanks = new Set<number>();
      let previous: JsonObject | undefined;
      rows.forEach((raw, index) => {
        const path = `${viewPath}[${index}]`;
        if (!isObject(raw)) { add("wrong-type", path, "ranking row must be an object"); return; }
        const rowString = (key: string) => typeof raw[key] === "string" ? raw[key] as string : undefined;
        const rowNumber = (key: string) => typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] as number : undefined;
        const name = rowString("name"); const slug = rowString("slug"); const sex = rowString("sex");
        if (!name?.trim()) add("invalid-value", `${path}.name`, "name must be non-empty");
        if (!slug?.trim()) add("invalid-value", `${path}.slug`, "slug must be non-empty");
        if (sex !== "F" && sex !== "M") add("invalid-value", `${path}.sex`, "sex must be F or M");
        if (view === "female" && sex !== "F") add("invalid-value", `${path}.sex`, "female ranking rows must have sex F");
        if (view === "male" && sex !== "M") add("invalid-value", `${path}.sex`, "male ranking rows must have sex M");
        if (name && sex) { const identity = `${sex}|${name.trim().toLowerCase()}`; if (identities.has(identity)) add("duplicate-identity", path, `duplicate identity ${identity}`); identities.add(identity); }
        if (slug && sex) { const identity = `${sex}|${slug.trim().toLowerCase()}`; if (slugs.has(identity)) add("duplicate-identity", path, `duplicate slug ${identity}`); slugs.add(identity); }
        const ownershipRank = rowNumber("ownershipRank"); const popularityRank = rowNumber("popularityRank");
        const rowInteger = (key: string, min = 0) => {
          if (!(key in raw)) { add("missing-field", `${path}.${key}`, `${key} is required`); return undefined; }
          const current = raw[key];
          if (typeof current !== "number") { add("wrong-type", `${path}.${key}`, `${key} must be a number`); return undefined; }
          if (!Number.isFinite(current)) { add("non-finite-number", `${path}.${key}`, `${key} must be finite`); return undefined; }
          if (!Number.isInteger(current) || current < min) add("invalid-value", `${path}.${key}`, `${key} must be an integer >= ${min}`);
          return current;
        };
        const rankedYears = rowInteger("rankedYearsInDecade", 1);
        const peakYear = rowInteger("peakYear", 1880); rowInteger("peakCount", 1); const firstYear = rowInteger("firstYear", 1880); const lastYear = rowInteger("lastYear", 1880);
        if (!("status" in raw)) add("missing-field", `${path}.status`, "status is required");
        else if (typeof raw.status !== "string") add("wrong-type", `${path}.status`, "status must be a string");
        const coveredYears = startYear !== undefined && endYear !== undefined ? endYear - startYear + 1 : undefined;
        if (rankedYears !== undefined && coveredYears !== undefined && rankedYears > coveredYears) add("invalid-value", `${path}.rankedYearsInDecade`, "rankedYearsInDecade exceeds covered years");
        if (peakYear !== undefined && dataThroughYear !== undefined && peakYear > dataThroughYear) add("invalid-value", `${path}.peakYear`, "peakYear exceeds source coverage");
        if (firstYear !== undefined && lastYear !== undefined && dataThroughYear !== undefined && (firstYear > lastYear || lastYear > dataThroughYear)) add("invalid-value", `${path}.lastYear`, "lifetime year range is invalid");
        for (const key of ["adjustedConcentration"] as const) {
          if (!(key in raw)) add("missing-field", `${path}.${key}`, `${key} is required`);
          else if (typeof raw[key] !== "number") add("wrong-type", `${path}.${key}`, `${key} must be a number`);
          else if (!Number.isFinite(raw[key])) add("non-finite-number", `${path}.${key}`, `${key} must be finite`);
          else if (raw[key] < 0) add("invalid-value", `${path}.${key}`, `${key} must be non-negative`);
        }
        for (const [key, rank] of [["ownershipRank", ownershipRank], ["popularityRank", popularityRank]] as const) {
          if (rank === undefined || !Number.isInteger(rank) || rank < 1 || (distinctNames !== undefined && rank > distinctNames)) add("rank-invalid", `${path}.${key}`, `${key} must be a valid represented rank`);
        }
        if (view === "female" || view === "male") {
          if (ownershipRank !== undefined) { if (ownershipRanks.has(ownershipRank)) add("rank-invalid", `${path}.ownershipRank`, "duplicate ownership rank"); ownershipRanks.add(ownershipRank); }
          if (popularityRank !== undefined) { if (popularityRanks.has(popularityRank)) add("rank-invalid", `${path}.popularityRank`, "duplicate popularity rank"); popularityRanks.add(popularityRank); }
        }
        for (const [key, min, max] of [["ownershipScore", 0, 100], ["decadeShare", 0, 1], ["normalizedConcentration", 0, 1], ["normalizedProminence", 0, 1]] as const) {
          const current = rowNumber(key); if (current === undefined || current < min || current > max) add("invalid-value", `${path}.${key}`, `${key} must be between ${min} and ${max}`);
        }
        const births = rowNumber("birthsInDecade"); const lifetime = rowNumber("lifetimeBirths");
        if (births === undefined || !Number.isInteger(births) || births <= 0) add("invalid-value", `${path}.birthsInDecade`, "birthsInDecade must be a positive integer");
        if (lifetime === undefined || !Number.isInteger(lifetime) || births === undefined || lifetime < births) add("invalid-value", `${path}.lifetimeBirths`, "lifetimeBirths must be an integer at least birthsInDecade");
        if (previous) {
          const score = rowNumber("ownershipScore") ?? 0; const previousScore = typeof previous.ownershipScore === "number" ? previous.ownershipScore : 0;
          const previousBirths = typeof previous.birthsInDecade === "number" ? previous.birthsInDecade : 0;
          const previousName = typeof previous.name === "string" ? previous.name : "";
          const delta = (rowNumber("popularityRank") ?? 0) - (rowNumber("ownershipRank") ?? 0);
          const previousDelta = (typeof previous.popularityRank === "number" ? previous.popularityRank : 0) - (typeof previous.ownershipRank === "number" ? previous.ownershipRank : 0);
          let ordered = true;
          if (view === "female" || view === "male" || view === "mostOwned") ordered = previousScore > score || (previousScore === score && (previousBirths > (births ?? 0) || (previousBirths === births && compareNames(previousName, name ?? "") <= 0)));
          else if (view === "unexpected") ordered = previousDelta > delta || (previousDelta === delta && (previousBirths > (births ?? 0) || (previousBirths === births && compareNames(previousName, name ?? "") <= 0)));
          else ordered = previousBirths > (births ?? 0) || (previousBirths === births && compareNames(previousName, name ?? "") <= 0);
          if (!ordered) add("order-invalid", path, `${view} rows are out of order`);
        }
        previous = raw;
      });
    }
  }

  const classroom = value.classroomDefaults;
  if (!isObject(classroom)) {
    if ("classroomDefaults" in value) add("wrong-type", "$.classroomDefaults", "classroomDefaults must be an object");
  } else {
    const cpath = "$.classroomDefaults";
    const cnum = (key: string) => typeof classroom[key] === "number" && Number.isFinite(classroom[key]) ? classroom[key] as number : undefined;
    const year = cnum("year"); const size = cnum("size"); const femaleSeats = cnum("femaleSeats"); const maleSeats = cnum("maleSeats");
    const uniqueNames = cnum("uniqueNames"); const repeatedNames = cnum("repeatedNames"); const topShare = cnum("topShare");
    for (const [key, current, min] of [["year", year, 1], ["size", size, 1], ["femaleSeats", femaleSeats, 0], ["maleSeats", maleSeats, 0], ["uniqueNames", uniqueNames, 0], ["repeatedNames", repeatedNames, 0]] as const) {
      if (current === undefined || !Number.isInteger(current) || current < min) add("classroom-invalid", `${cpath}.${key}`, `${key} must be an integer >= ${min}`);
    }
    if (year !== definition.classroomYear || (endYear !== undefined && (year < definition.startYear || year > endYear))) add("classroom-invalid", `${cpath}.year`, "classroom year must match the definition and actual coverage");
    if (size !== 30) add("classroom-invalid", `${cpath}.size`, "classroom size must be 30");
    if (femaleSeats === undefined || maleSeats === undefined || femaleSeats <= 0 || maleSeats <= 0 || femaleSeats + maleSeats !== 30) add("classroom-invalid", `${cpath}.femaleSeats`, "classroom sex seats must be positive and sum to 30");
    const students = classroom.students;
    if (!Array.isArray(students)) add("wrong-type", `${cpath}.students`, "students must be an array");
    else {
      const identities = new Map<string, { name: string; slug: string; sex: "F" | "M"; seats: number; occurrences: number }>();
      let malformed = false;
      students.forEach((raw, index) => {
        const path = `${cpath}.students[${index}]`;
        if (!isObject(raw)) { add("classroom-invalid", path, "student must be an object"); malformed = true; return; }
        const name = typeof raw.name === "string" ? raw.name : ""; const slug = typeof raw.slug === "string" ? raw.slug : "";
        const sex = raw.sex; const seats = raw.seats;
        if (!name.trim() || !slug.trim() || (sex !== "F" && sex !== "M") || typeof seats !== "number" || !Number.isInteger(seats) || seats < 1) { add("classroom-invalid", path, "student identity and seats are invalid"); malformed = true; return; }
        const key = `${sex}|${slug.toLowerCase()}`; const existing = identities.get(key);
        if (existing && (existing.name !== name || existing.slug !== slug || existing.seats !== seats)) { add("classroom-invalid", path, "classroom identity entries must be consistent"); malformed = true; }
        if (existing) existing.occurrences += 1; else identities.set(key, { name, slug, sex, seats, occurrences: 1 });
      });
      const expanded = students.length === 30;
      let seatTotal = 0; let derivedFemale = 0; let derivedMale = 0;
      for (const identity of identities.values()) {
        if (expanded && identity.occurrences !== identity.seats) malformed = true;
        if (!expanded && identity.occurrences !== 1) malformed = true;
        seatTotal += identity.seats;
        if (identity.sex === "F") derivedFemale += identity.seats; else derivedMale += identity.seats;
      }
      if (students.length > 30 || malformed || seatTotal !== 30) add("classroom-invalid", `${cpath}.students`, "roster representation must reconcile to exactly 30 seats");
      if (femaleSeats !== derivedFemale) add("classroom-invalid", `${cpath}.femaleSeats`, "femaleSeats must match roster identities");
      if (maleSeats !== derivedMale) add("classroom-invalid", `${cpath}.maleSeats`, "maleSeats must match roster identities");
      if (uniqueNames !== identities.size) add("classroom-invalid", `${cpath}.uniqueNames`, "uniqueNames must match roster identities");
      if (repeatedNames !== 30 - identities.size) add("classroom-invalid", `${cpath}.repeatedNames`, "repeatedNames must equal size - uniqueNames");
      const ordered = [...identities.values()].sort((a, b) => b.seats - a.seats || compareNames(a.name, b.name) || (a.sex < b.sex ? -1 : a.sex > b.sex ? 1 : 0));
      const most = classroom.mostRepeated;
      if (!isObject(most) || !ordered[0] || most.name !== ordered[0].name || most.slug !== ordered[0].slug || most.seats !== ordered[0].seats) add("classroom-invalid", `${cpath}.mostRepeated`, "mostRepeated must identify the deterministic maximum-seat identity");
      if (topShare === undefined || !ordered[0] || Math.abs(topShare - ordered[0].seats / 30) > 1e-4) add("classroom-invalid", `${cpath}.topShare`, "topShare must equal mostRepeated.seats / 30");
    }
  }

  const families = value.spellingFamilies;
  if (!Array.isArray(families)) {
    if ("spellingFamilies" in value) add("wrong-type", "$.spellingFamilies", "spellingFamilies must be an array");
  } else {
    const familyIds = new Set<string>(); const globalVariants = new Set<string>();
    families.forEach((raw, familyIndex) => {
      const path = `$.spellingFamilies[${familyIndex}]`;
      if (!isObject(raw)) { add("family-invalid", path, "family must be an object"); return; }
      const id = typeof raw.id === "string" ? raw.id.trim() : ""; const idKey = id.toLowerCase();
      if (!id || familyIds.has(idKey)) add("duplicate-identity", path, "family ids must be non-empty and unique");
      familyIds.add(idKey);
      const variants = raw.variants;
      if (!Array.isArray(variants) || variants.length < 2) { add("family-invalid", `${path}.variants`, "family must contain at least two variants"); return; }
      const variantNames = new Set<string>(); const variantRows: { name: string; births: number; share: number }[] = [];
      variants.forEach((variant, variantIndex) => {
        const vpath = `${path}.variants[${variantIndex}]`;
        if (!isObject(variant)) { add("family-invalid", vpath, "variant must be an object"); return; }
        const name = typeof variant.name === "string" ? variant.name.trim() : ""; const key = name.toLowerCase();
        const slug = typeof variant.slug === "string" ? variant.slug.trim() : ""; const births = variant.birthsInDecade; const share = variant.shareOfFamily;
        if (!name || !slug || variantNames.has(key) || globalVariants.has(key)) add("duplicate-identity", vpath, "variant names must be non-empty and unique within/across families");
        variantNames.add(key); globalVariants.add(key);
        if (typeof births !== "number" || !Number.isInteger(births) || births <= 0 || typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) add("family-invalid", vpath, "variant births/share are invalid");
        else variantRows.push({ name, births, share });
      });
      const total = raw.totalBirthsInDecade;
      const rank = raw.combinedDecadeRank;
      if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1 || (distinctNames !== undefined && rank > distinctNames)) add("family-invalid", `${path}.combinedDecadeRank`, "combinedDecadeRank must be a valid integer rank");
      for (const key of ["label", "canonicalDisplayName", "dominantVariant", "rationale"] as const) if (typeof raw[key] !== "string" || !raw[key].trim()) add("family-invalid", `${path}.${key}`, `${key} must be non-empty`);
      variants.forEach((variant, variantIndex) => {
        if (!isObject(variant)) return;
        const rankValue = variant.decadeRank;
        if (rankValue !== null && (typeof rankValue !== "number" || !Number.isInteger(rankValue) || rankValue < 1 || (distinctNames !== undefined && rankValue > distinctNames))) add("family-invalid", `${path}.variants[${variantIndex}].decadeRank`, "decadeRank must be null or a valid integer rank");
      });
      const variantTotal = variantRows.reduce((sum, variant) => sum + variant.births, 0);
      if (typeof total !== "number" || !Number.isInteger(total) || total !== variantTotal) add("family-invalid", `${path}.totalBirthsInDecade`, "family total must equal variant births");
      if (typeof total === "number" && total > 0) {
        const shareTotal = variantRows.reduce((sum, variant) => sum + variant.share, 0);
        if (Math.abs(shareTotal - 1) > 1e-5 || variantRows.some((variant) => Math.abs(variant.share - variant.births / total) > 1e-5)) add("family-invalid", `${path}.variants`, "variant shares must reconcile to family births");
      }
      const canonical = typeof raw.canonicalDisplayName === "string" ? raw.canonicalDisplayName.toLowerCase() : "";
      const dominant = typeof raw.dominantVariant === "string" ? raw.dominantVariant.toLowerCase() : "";
      if (!variantNames.has(canonical)) add("family-invalid", `${path}.canonicalDisplayName`, "canonical display name must be a variant");
      const dominantExpected = [...variantRows].sort((a, b) => b.births - a.births || compareNames(a.name, b.name))[0]?.name.toLowerCase();
      if (!dominant || dominant !== dominantExpected) add("family-invalid", `${path}.dominantVariant`, "dominant variant must be the deterministic maximum-birth variant");
      if (raw.reviewStatus !== "approved") add("family-invalid", `${path}.reviewStatus`, "family reviewStatus must be approved");
      const yearly = raw.yearly;
      const derivedEnd = dataThroughYear !== undefined && dataThroughYear >= definition.startYear
        ? Math.min(definition.nominalEndYear, dataThroughYear)
        : undefined;
      const expectedYears = startYear === definition.startYear && endYear === derivedEnd && derivedEnd !== undefined
        ? Array.from({ length: derivedEnd - definition.startYear + 1 }, (_, index) => definition.startYear + index)
        : [];
      if (!Array.isArray(yearly) || yearly.length !== expectedYears.length || yearly.some((point, index) => !isObject(point) || point.year !== expectedYears[index])) {
        add("family-invalid", `${path}.yearly`, "family yearly points must exactly cover profile years");
      } else {
        let yearlyTotal = 0; let peakYear = expectedYears[0]; let peakTotal = -1;
        yearly.forEach((point, yearIndex) => {
          const pointPath = `${path}.yearly[${yearIndex}]`; let sum = 0; let valid = true;
          for (const variant of variantRows) { const count = point[variant.name]; if (typeof count !== "number" || !Number.isInteger(count) || count < 0) { add("family-invalid", `${pointPath}.${variant.name}`, "yearly variant count must be a non-negative integer"); valid = false; } else sum += count; }
          if (point.total !== sum) add("family-invalid", `${pointPath}.total`, "yearly total must equal variant counts");
          if (valid) yearlyTotal += sum;
          if (sum > peakTotal) { peakTotal = sum; peakYear = point.year as number; }
        });
        if (typeof total === "number" && yearlyTotal !== total) add("family-invalid", `${path}.yearly`, "yearly totals must equal family total");
        if (raw.peakYear !== peakYear) add("family-invalid", `${path}.peakYear`, "peakYear must be the first maximum-total year");
      }
    });
  }

  return issues.length ? { ok: false, issues } : { ok: true, profile: value as unknown as DecadeProfile, issues: [] };
}
