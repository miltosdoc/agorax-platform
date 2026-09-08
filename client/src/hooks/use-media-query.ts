import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query and re-renders when it flips.
 *
 * The initial value is read synchronously so the first paint is already
 * right; an `undefined` start would flash the wrong layout for a frame on
 * every screen size before the effect corrected it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
