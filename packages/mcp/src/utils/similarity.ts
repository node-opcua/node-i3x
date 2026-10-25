/**
 * Computes a normalized similarity score between two strings (0.0 to 1.0)
 * using Levenshtein edit distance and substring matching.
 */
export function computeSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Exact substring boost
  if (s1.includes(s2) || s2.includes(s1)) {
    const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    return Math.max(0.7, ratio);
  }

  // Levenshtein distance calculation
  const m = s1.length;
  const n = s2.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = temp;
    }
  }

  const distance = dp[n]!;
  const maxLen = Math.max(m, n);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Ranks candidate strings by similarity against a target query,
 * returning the top N matches with score >= minScore.
 */
export function rankSuggestions(
  query: string,
  candidates: string[],
  topN = 5,
  minScore = 0.4,
): string[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: computeSimilarity(query, candidate),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((item) => item.candidate);
}

/**
 * Ranks objects against a query by the better of their elementId and displayName
 * scores: elementIds are often opaque hashes, so names are what users type.
 */
export function rankObjectSuggestions(
  query: string,
  objects: ReadonlyArray<{ elementId: string; displayName?: string }>,
  topN = 5,
  minScore = 0.4,
): Array<{ elementId: string; displayName?: string }> {
  return objects
    .map(({ elementId, displayName }) => ({
      elementId,
      displayName,
      score: Math.max(
        computeSimilarity(query, elementId),
        displayName ? computeSimilarity(query, displayName) : 0,
      ),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ elementId, displayName }) => ({ elementId, displayName }));
}
