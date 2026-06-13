/**
 * Custom name-specific Metaphone phonetic encoder.
 * Designed to normalize spelling variants of baby names (e.g. Caitlin -> KTLN, Katelyn -> KTLN).
 */
export function getPhoneticKey(name: string): string {
  if (!name) return "";
  let s = name.toLowerCase().trim();
  if (!s) return "";

  // 1. Initial transformations
  if (s.startsWith("kn") || s.startsWith("gn") || s.startsWith("pm") || s.startsWith("ae") || s.startsWith("wr")) {
    s = s.slice(1);
  }
  if (s.startsWith("x")) {
    s = "s" + s.slice(1);
  }
  // Map Sean/Sian to Sh- so they map to 'X' (SH sound) correctly
  if (s.startsWith("sean") || s.startsWith("sian")) {
    s = "sh" + s.slice(2);
  }

  // 2. Map standard consonants
  let code = "";
  // Keep first vowel if at start
  const firstChar = s[0]!;
  if (/[aeiouy]/.test(firstChar)) {
    code += firstChar.toUpperCase();
  }

  for (let i = 0; i < s.length; i++) {
    // Drop duplicates
    if (i > 0 && s[i] === s[i - 1] && s[i] !== "c") {
      continue;
    }

    const c = s[i]!;
    const next = s[i + 1] ?? "";
    const prev = s[i - 1] ?? "";

    // Ignore vowels unless first letter (which is handled above)
    if (/[aeiouy]/.test(c)) {
      continue;
    }

    switch (c) {
      case "b":
        if (!(i === s.length - 1 && prev === "m")) {
          code += "B";
        }
        break;
      case "c":
        if (next === "h" || (next === "i" && s[i + 2] === "a")) {
          code += "X";
          if (next === "h") i++;
        } else if (/[eiy]/.test(next)) {
          code += "S";
        } else {
          code += "K";
        }
        break;
      case "d":
        if (next === "g" && /[eiy]/.test(s[i + 2] ?? "")) {
          code += "J";
          i += 2;
        } else {
          code += "T";
        }
        break;
      case "f":
        code += "F";
        break;
      case "g":
        if (next === "h") {
          if (i === s.length - 2) {
            code += "F";
          }
          i++;
        } else if (/[eiy]/.test(next)) {
          code += "J";
        } else if (next === "n") {
          // Drop g in gn
        } else {
          code += "K";
        }
        break;
      case "h":
        if (i === 0 || (/[aeiouy]/.test(prev) && /[aeiouy]/.test(next))) {
          code += "H";
        }
        break;
      case "j":
        code += "J";
        break;
      case "k":
        if (prev !== "c") {
          code += "K";
        }
        break;
      case "l":
        code += "L";
        break;
      case "m":
        code += "M";
        break;
      case "n":
        code += "N";
        break;
      case "p":
        if (next === "h") {
          code += "F";
          i++;
        } else {
          code += "P";
        }
        break;
      case "q":
        code += "K";
        break;
      case "r":
        code += "R";
        break;
      case "s":
        if (next === "h" || (next === "i" && /[ao]/.test(s[i + 2] ?? ""))) {
          code += "X";
          if (next === "h") i++;
        } else {
          code += "S";
        }
        break;
      case "t":
        if (next === "h") {
          code += "T";
          i++;
        } else if (next === "i" && /[ao]/.test(s[i + 2] ?? "")) {
          code += "X";
        } else {
          code += "T";
        }
        break;
      case "v":
        code += "F";
        break;
      case "w":
      case "y":
        if (/[aeiouy]/.test(next)) {
          code += c.toUpperCase();
        }
        break;
      case "x":
        code += "KS";
        break;
      case "z":
        code += "S";
        break;
    }
  }

  // Deduplicate consecutive letters in the code
  let cleanCode = "";
  for (let i = 0; i < code.length; i++) {
    if (i === 0 || code[i] !== code[i - 1]) {
      cleanCode += code[i];
    }
  }
  return cleanCode;
}
