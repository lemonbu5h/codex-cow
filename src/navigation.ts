import { MultiSelectPrompt, SelectPrompt, updateSettings, type Prompt } from "@clack/core";
import pc from "picocolors";
import { stripVTControlCharacters } from "node:util";
import type { Readable, Writable } from "node:stream";

export interface PickerOption {
  value: string;
  label: string;
}

export interface PickerOptions {
  message: string;
  hints: string;
  options: PickerOption[];
  initialValue?: string;
  initialValues?: string[];
  back?: boolean;
  input?: Readable;
  output?: Writable;
}

export interface NavigationResult<T> {
  action: "submit" | "back" | "quit";
  value: T;
}

export function select(options: PickerOptions): Promise<NavigationResult<string>> {
  const prompt = new SelectPrompt({
    input: options.input,
    output: options.output,
    options: options.options,
    initialValue: options.initialValue,
    render() {
      return renderPicker(options, this.state, this.cursor, [this.value], false);
    },
  });
  return navigate(prompt, options.back ?? true, options.output ?? process.stdout);
}

export function multiselect(options: PickerOptions): Promise<NavigationResult<string[]>> {
  const prompt = new MultiSelectPrompt({
    input: options.input,
    output: options.output,
    options: options.options,
    initialValues: options.initialValues,
    render() {
      return renderPicker(options, this.state, this.cursor, this.value, true);
    },
  });
  return navigate(prompt, true, options.output ?? process.stdout);
}

async function navigate<T>(prompt: Prompt, back: boolean, output: Writable): Promise<NavigationResult<T>> {
  updateSettings({ aliases: { q: "cancel" } });
  let action: NavigationResult<T>["action"] = "submit";
  let escape = false;
  // Bare Esc has no character in readline; q and Ctrl-C also emit a key event below.
  prompt.on("cursor", (key) => { escape = key === "cancel"; });
  prompt.on("key", (key) => { escape = key === "\u001b"; });
  // Finalize runs before Clack closes the prompt, while its checkbox values still exist.
  prompt.on("finalize", () => {
    if (prompt.state !== "cancel") return;
    if (escape && !back) {
      prompt.state = "active";
      return;
    }
    action = escape ? "back" : "quit";
  });
  await prompt.prompt();
  // Clack clears the empty final frame but writes a newline on close. Reuse that row.
  output.write("\u001b[1A\r\u001b[2K");
  return { action, value: prompt.value as T };
}

function renderPicker(
  options: PickerOptions,
  state: string,
  cursor: number,
  selected: string[],
  multiple: boolean,
): string {
  if (state === "submit" || state === "cancel") return "";
  const count = Math.max(1, Math.min(12, (process.stdout.rows || 24) - 6));
  const start = Math.max(0, Math.min(cursor - Math.floor(count / 2), options.options.length - count));
  const visible = options.options.slice(start, start + count);
  const width = Math.max(1, (process.stdout.columns || 80) - 9);
  const lines = visible.map((option, index) => {
    const focused = start + index === cursor;
    const mark = multiple ? (selected.includes(option.value) ? "[x]" : "[ ]") : (focused ? "(*)" : "( )");
    const label = fitLine(option.label, width);
    return `| ${focused ? pc.cyan(">") : " "} ${focused ? pc.cyan(mark) : pc.dim(mark)} ${focused ? label : pc.dim(label)}`;
  });
  const position = options.options.length > count ? ` (${cursor + 1}/${options.options.length})` : "";
  return [
    `|  ${fitLine(options.message + position, width)}`,
    ...lines,
    `|  ${pc.dim(fitLine(options.hints, width))}`,
    "|",
  ].join("\n");
}

function fitLine(text: string, width: number): string {
  const clean = text.replace(/[\r\n\t]/g, " ");
  if (Bun.stringWidth(clean) <= width) return clean;
  let clipped = "";
  for (const { segment } of new Intl.Segmenter().segment(stripVTControlCharacters(clean))) {
    if (Bun.stringWidth(clipped + segment) > width - 1) break;
    clipped += segment;
  }
  return clipped + "…";
}
