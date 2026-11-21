/**
 * Smart multi-token, word-agnostic, compact & typo-tolerant search utility.
 * Matches front, middle, or end substrings, out-of-order words (e.g. "tecno 3" or "3 go" -> "TECNO GO 3"),
 * space/punctuation-collapsed strings (e.g. "go3" -> "GO 3", "03001234567" -> "0300-1234567"),
 * common consonant abbreviations (e.g. "tcn" -> "tecno"), and 1-char typos on words >= 4 chars.
 */

type SearchField = string | number | undefined | null;

const normalizeCompact = (val: string): string => val.replace(/[^a-z0-9]/g, '');

const editDistanceAtMostOne = (a: string, b: string): boolean => {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (a === b) return true;

  // Allow transposition of two adjacent chars (e.g. "teno" vs "tecno" or "samsugn" vs "samsung")
  if (la === lb) {
    let diffs = 0;
    let firstDiff = -1;
    let secondDiff = -1;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs === 1) firstDiff = i;
        else if (diffs === 2) secondDiff = i;
        else return false;
      }
    }
    if (diffs === 1) return true;
    if (diffs === 2 && secondDiff === firstDiff + 1 && a[firstDiff] === b[secondDiff] && a[secondDiff] === b[firstDiff]) {
      return true;
    }
    return false;
  }

  // Insertion / deletion of 1 character
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
};

const isTightSubsequence = (word: string, token: string): boolean => {
  if (token.length < 3 || word.length < token.length) return false;
  if (word[0] !== token[0]) return false;
  let ti = 0;
  for (let wi = 0; wi < word.length && ti < token.length; wi++) {
    if (word[wi] === token[ti]) ti++;
  }
  return ti === token.length;
};

const isAlphaOnly = (str: string): boolean => /^[a-z]+$/.test(str);

export function smartSearchScore(
  query: string,
  primaryFields: SearchField[],
  secondaryFields: SearchField[] = []
): number {
  const q = (query || '').trim().toLowerCase();
  if (!q) return 1;

  const pArr = primaryFields
    .filter((v): v is string | number => v !== undefined && v !== null && v !== '')
    .map(v => String(v).toLowerCase().trim())
    .filter(Boolean);

  const sArr = secondaryFields
    .filter((v): v is string | number => v !== undefined && v !== null && v !== '')
    .map(v => String(v).toLowerCase().trim())
    .filter(Boolean);

  if (pArr.length === 0 && sArr.length === 0) return 0;

  const primaryText = pArr.join(' ');
  const allText = [...pArr, ...sArr].join(' ');
  const compactQ = normalizeCompact(q);
  const compactPrimary = normalizeCompact(primaryText);
  const compactAll = normalizeCompact(allText);
  const words = allText.split(/[\s\-_/.,()|•:+]+/).filter(Boolean);
  const primaryWords = primaryText.split(/[\s\-_/.,()|•:+]+/).filter(Boolean);

  // Fast exact / prefix checks
  let score = 0;

  if (pArr.some(f => f === q)) score = Math.max(score, 2500);
  else if (sArr.some(f => f === q)) score = Math.max(score, 2200);

  if (compactQ.length >= 2) {
    if (pArr.some(f => normalizeCompact(f) === compactQ)) score = Math.max(score, 2000);
    else if (sArr.some(f => normalizeCompact(f) === compactQ)) score = Math.max(score, 1800);
  }

  if (pArr.some(f => f.startsWith(q))) score = Math.max(score, 1400);
  else if (sArr.some(f => f.startsWith(q))) score = Math.max(score, 1100);

  if (primaryText.includes(q)) {
    const wordStartBonus = primaryWords.some(w => w.startsWith(q)) ? 250 : 0;
    const exactWordBonus = primaryWords.some(w => w === q) ? 350 : 0;
    score = Math.max(score, 650 + wordStartBonus + exactWordBonus);
  } else if (allText.includes(q)) {
    const wordStartBonus = words.some(w => w.startsWith(q)) ? 150 : 0;
    score = Math.max(score, 450 + wordStartBonus);
  }

  if (compactQ.length >= 2) {
    if (compactPrimary.includes(compactQ)) score = Math.max(score, 520);
    else if (compactAll.includes(compactQ)) score = Math.max(score, 360);
  }

  // Multi-token check: every token can appear at start, middle, or end of any field, in any order
  const rawTokens = q.split(/\s+/).filter(Boolean);
  if (rawTokens.length > 0) {
    let allDirectMatch = true;
    let tokenScore = 0;

    for (const tok of rawTokens) {
      const compactTok = normalizeCompact(tok);
      const inPrimary =
        primaryText.includes(tok) || (compactTok.length > 0 && compactPrimary.includes(compactTok));
      const inAll =
        inPrimary || allText.includes(tok) || (compactTok.length > 0 && compactAll.includes(compactTok));

      if (!inAll) {
        allDirectMatch = false;
        break;
      }

      if (primaryWords.some(w => w === tok)) tokenScore += 90;
      else if (primaryWords.some(w => w.startsWith(tok))) tokenScore += 70;
      else if (inPrimary) tokenScore += 50;
      else if (words.some(w => w.startsWith(tok))) tokenScore += 35;
      else tokenScore += 20;
    }

    if (allDirectMatch) {
      score = Math.max(score, 240 + tokenScore);
    } else if (score === 0) {
      // Fuzzy / typo / abbreviation fallback for alphabetic words (never false-match pure numeric IMEIs)
      let allFuzzyMatch = true;
      let fuzzyBonus = 0;

      for (const tok of rawTokens) {
        const compactTok = normalizeCompact(tok);
        const directHit =
          allText.includes(tok) || (compactTok.length > 0 && compactAll.includes(compactTok));
        if (directHit) {
          fuzzyBonus += primaryText.includes(tok) ? 40 : 20;
          continue;
        }

        if (!isAlphaOnly(tok) || tok.length < 3) {
          allFuzzyMatch = false;
          break;
        }

        const fuzzyHit = words.some(w => {
          const cleanW = normalizeCompact(w);
          if (!cleanW) return false;
          if (tok.length >= 4 && editDistanceAtMostOne(cleanW, tok)) return true;
          if (isTightSubsequence(cleanW, tok)) return true;
          return false;
        });

        if (!fuzzyHit) {
          allFuzzyMatch = false;
          break;
        }
        fuzzyBonus += 10;
      }

      if (allFuzzyMatch) {
        score = Math.max(score, 80 + fuzzyBonus);
      }
    }
  }

  return score;
}

export function smartMatch(
  query: string,
  primaryFields: SearchField[],
  secondaryFields: SearchField[] = []
): boolean {
  return smartSearchScore(query, primaryFields, secondaryFields) > 0;
}

export function smartFilterAndSort<T>(
  items: T[],
  query: string,
  getFields: (item: T) => { primary: SearchField[]; secondary?: SearchField[] }
): T[] {
  const q = (query || '').trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number; index: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { primary, secondary } = getFields(item);
    const s = smartSearchScore(q, primary, secondary || []);
    if (s > 0) {
      scored.push({ item, score: s, index: i });
    }
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  return scored.map(entry => entry.item);
}
