import stringWidth from "string-width";

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI terminal escapes.
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function runeWidth(character: string): number {
  return stringWidth(character);
}

export function graphemes(value: string): string[] {
  return [...GRAPHEME_SEGMENTER.segment(value)].map(({ segment }) => segment);
}

export function displayWidth(value: string): number {
  return stringWidth(stripAnsi(value));
}
