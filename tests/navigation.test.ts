import { expect, test } from "bun:test";
import { PassThrough, Writable } from "node:stream";
import { multiselect, select } from "../src/navigation.ts";

function terminal() {
  const input = new PassThrough();
  let text = "";
  const output = new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } });
  return { input, output, text: () => text };
}

const options = [{ value: "one", label: "First" }, { value: "two", label: "Second" }];
const tick = () => new Promise((resolve) => setTimeout(resolve, 80));

test("Esc does nothing at repos, including after moving the cursor", async () => {
  const io = terminal();
  let finished = false;
  const pending = select({ ...io, options, message: "Repos", hints: "up/down move | enter open | q quit", back: false });
  void pending.then(() => { finished = true; });
  io.input.write("j");
  await tick();
  const before = io.text();
  io.input.write("\u001b");
  await tick();
  expect(finished).toBe(false);
  expect(io.text()).toBe(before);
  io.input.write("\r");
  expect(await pending).toEqual({ action: "submit", value: "two" });
  expect(io.input.listenerCount("keypress")).toBe(0);
});

test("Esc keeps checkboxes when returning from sessions", async () => {
  const io = terminal();
  const pending = multiselect({ ...io, options, message: "Sessions", hints: "space select | enter/esc back | q quit" });
  io.input.write(" ");
  io.input.write("\u001b");
  expect(await pending).toEqual({ action: "back", value: ["one"] });
  expect(io.input.listenerCount("keypress")).toBe(0);
});

test("q and Ctrl-C quit instead of going back", async () => {
  for (const key of ["q", "\u0003"]) {
    const io = terminal();
    const pending = multiselect({ ...io, options, message: "Sessions", hints: "q quit", initialValues: ["two"] });
    io.input.write(key);
    expect(await pending).toEqual({ action: "quit", value: ["two"] });
  }
});

test("Esc at confirmation goes back even with Yes focused", async () => {
  const io = terminal();
  const pending = select({ ...io, options, message: "Confirm", hints: "esc back | q quit", initialValue: "two" });
  io.input.write("\u001b");
  expect(await pending).toEqual({ action: "back", value: "two" });
});

test("Enter accepts updated checkboxes and arrow keys move without going back", async () => {
  const io = terminal();
  const pending = multiselect({ ...io, options, message: "Sessions", hints: "esc back", initialValues: ["one"] });
  io.input.write(" ");
  io.input.write("\u001b[B");
  io.input.write(" ");
  io.input.write("\r");
  expect(await pending).toEqual({ action: "submit", value: ["two"] });
});

test("long lists scroll in a bounded frame and long labels fit one row", async () => {
  const io = terminal();
  const pending = select({
    ...io,
    options: Array.from({ length: 30 }, (_, index) => ({ value: String(index), label: `Session ${index} ` + "測試".repeat(80) })),
    message: "Repos",
    hints: "up/down move | enter open | q quit",
  });
  const firstFrame = io.text();
  expect(firstFrame.split("\n").length).toBeLessThanOrEqual(16);
  for (const line of firstFrame.split("\n")) expect(Bun.stringWidth(line)).toBeLessThan(process.stdout.columns || 80);
  io.input.write("k");
  io.input.write("\r");
  expect(await pending).toEqual({ action: "submit", value: "29" });
});

test("returning between prompts clears the heading and reuses the prompt row", async () => {
  const io = terminal();
  for (const message of ["Pick a repo", "Pick sessions: demo", "Pick a repo"]) {
    const pending = select({ ...io, options, message, hints: "enter open | esc back | q quit" });
    const before = io.text().length;
    io.input.write("\r");
    await pending;
    const closing = io.text().slice(before);
    expect(closing).toContain("\u001b[J");
    expect(closing).not.toContain(message);
    expect(closing.endsWith("\u001b[1A\r\u001b[2K")).toBe(true);
  }
});
