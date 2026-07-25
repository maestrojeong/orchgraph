// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI terminal escapes.
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function runeWidth(character: string): number {
  const code = character.codePointAt(0) ?? 0;
  if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) return 0;
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      code >= 0x20000)
  ) {
    return 2;
  }
  return 1;
}

export function displayWidth(value: string): number {
  return [...stripAnsi(value)].reduce((width, character) => width + runeWidth(character), 0);
}
