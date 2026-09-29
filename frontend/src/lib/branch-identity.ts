/**
 * Branch names are display labels, not stable identifiers. All joins use this
 * canonical key so casing, Turkish dotted/dotless I, accents and spacing do not
 * split one logical line of business into multiple branches.
 */
export function branchIdentityKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function sameBranchName(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return branchIdentityKey(left) === branchIdentityKey(right);
}

export function cleanBranchDisplayName(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/** Deduplicate by identity while preserving the first source spelling. */
export function uniqueBranchNames(
  values: Iterable<string | null | undefined>,
): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const display = cleanBranchDisplayName(value);
    const key = branchIdentityKey(display);
    if (key && !names.has(key)) names.set(key, display);
  }
  return [...names.values()];
}
