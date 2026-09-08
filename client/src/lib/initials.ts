/**
 * Two-letter monogram for an avatar disc.
 *
 * Takes the first letter of the first and last word, so "Νίκος Μ. Παπάς" reads
 * ΝΠ rather than ΝΜ. Falls back to the first two characters of a single word,
 * and to a neutral dash when there is no usable name — an empty disc is worse
 * than an obviously blank one.
 */
export function initials(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("el");
  const first = words[0][0];
  const last = words[words.length - 1][0];
  return `${first}${last}`.toLocaleUpperCase("el");
}
