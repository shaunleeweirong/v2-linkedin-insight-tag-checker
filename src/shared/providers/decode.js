// Shared decoding helpers for the vendor providers.
//
// A provider declares a `keys` map (raw param → friendly name + group) and,
// optionally, `dynamic` rules for templated params (GA4's `ep.*`, Meta's `cd[*]`).
//
// Anything a provider does NOT declare still comes through, labelled with its raw
// key under "Other". Both LinkedIn and Google ship undocumented params, so silently
// dropping the unknown ones would defeat the point of being a decoder.

export const MAX_VALUE_LEN = 200;
export const OTHER_GROUP = 'Other';

/** Bound a single decoded value so a long payload can't bloat session storage. */
export function truncate(value, max = MAX_VALUE_LEN) {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Decode a URLSearchParams into a flat, display-ready param list.
 *
 * @param {URLSearchParams} searchParams
 * @param {Record<string, {name: string, group?: string}>} keys  known params
 * @param {Array<{test: RegExp, name: (key: string) => string, group?: string}>} dynamic
 *        rules for templated params. Patterns MUST be non-global (a /g/ regex is
 *        stateful across .test() calls and would match every other param).
 * @returns {Array<{key: string, name: string, group: string, value: string}>}
 */
export function decodeParams(searchParams, keys = {}, dynamic = []) {
  const out = [];

  for (const [key, rawValue] of searchParams.entries()) {
    const known = keys[key];
    if (known) {
      out.push({
        key,
        name: known.name,
        group: known.group || OTHER_GROUP,
        value: truncate(rawValue)
      });
      continue;
    }

    const rule = dynamic.find((d) => d.test.test(key));
    out.push({
      key,
      name: rule ? rule.name(key) : key,
      group: (rule && rule.group) || OTHER_GROUP,
      value: truncate(rawValue)
    });
  }

  return out;
}
