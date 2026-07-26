/**
 * A tiny, dependency-free helper for writing terminal decorators without
 * memorizing raw ANSI escape sequences (`[38;5;214m`, `[1;33m`,
 * ...). `theme`/`edgeTheme` decorators are plain functions, so `style()`
 * just returns one:
 *
 * ```ts
 * theme: {
 *   running: style({ color: "orange", bold: true }),
 *   blocked: style({ invert: true }),
 * }
 * ```
 */
export type TerminalColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "orange"
  | "pink";

export interface StyleOptions {
  color?: TerminalColor;
  bold?: boolean;
  dim?: boolean;
  invert?: boolean;
}

const RESET = "[0m";

// Standard 16-color codes, available on essentially every terminal.
const STANDARD_COLOR_CODES: Partial<Record<TerminalColor, number>> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
};

// A couple of named colors outside the standard 16, via the 256-color
// palette (`38;5;<n>`), for names people actually reach for that ANSI has
// no dedicated code for.
const EXTENDED_COLOR_CODES: Partial<Record<TerminalColor, number>> = {
  orange: 214,
  pink: 213,
};

function colorCodes(color: TerminalColor): number[] {
  const extended = EXTENDED_COLOR_CODES[color];
  if (extended !== undefined) return [38, 5, extended];
  return [STANDARD_COLOR_CODES[color] ?? 39];
}

/**
 * Builds a `(value: string) => string` decorator from named options instead
 * of a raw ANSI escape sequence. Works directly as a `theme`/`edgeTheme`
 * entry since those only ever read the first argument.
 */
export function style(options: StyleOptions): (value: string) => string {
  const codes: number[] = [];
  if (options.bold) codes.push(1);
  if (options.dim) codes.push(2);
  if (options.invert) codes.push(7);
  if (options.color) codes.push(...colorCodes(options.color));
  if (codes.length === 0) return (value) => value;
  const prefix = `[${codes.join(";")}m`;
  return (value: string) => `${prefix}${value}${RESET}`;
}
