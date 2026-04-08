/**
 * Read an environment variable, stripping a single matching pair of surrounding
 * quotes if present. Railway's Raw Editor silently wraps values in double-quotes
 * which then get stored literally — this helper absorbs that so a misformatted
 * Raw Editor paste doesn't silently break OAuth/Kaiten lookups.
 *
 * Rules:
 *  - `"foo"` -> `foo`
 *  - `'foo'` -> `foo`
 *  - `"foo` -> `"foo` (unbalanced, left as-is)
 *  - `foo`   -> `foo`
 *  - `""`    -> undefined (treat an empty quoted string as unset)
 *  - unset   -> undefined
 */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const stripped = stripSurroundingQuotes(raw);
  return stripped === "" ? undefined : stripped;
}

/**
 * Strip a single matching pair of surrounding single or double quotes.
 * Exposed so list-valued env vars can normalize each item after splitting.
 */
export function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}
