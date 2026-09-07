import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

test("locked deletion prints a friendly error without a stack trace", async () => {
  const codexHome = await createLockedSessionFixture();
  const { exitCode, stderr } = await runCli(codexHome, ["rm", "thread-1", "--yes"]);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("Cannot delete 1 session; Codex is still using it.");
  expect(stderr).toContain("No changes were made.");
  expect(stderr).not.toContain(" at ");

  const db = new Database(join(codexHome, "state_5.sqlite"), { create: false, readonly: true });
  try {
    expect(db.query("SELECT id FROM threads WHERE id = ?").get("thread-1")).toEqual({ id: "thread-1" });
  } finally {
    db.close();
  }
});

test("list renders sessions without a Git origin in active and archived scopes", async () => {
  const codexHome = await createLockedSessionFixture();
  const db = new Database(join(codexHome, "state_5.sqlite"), { create: false, readwrite: true });
  try {
    db.run("UPDATE threads SET git_origin_url = NULL");
    for (const archived of [0, 1]) {
      db.query("UPDATE threads SET archived = ?").run(archived);
      const { exitCode, stdout, stderr } = await runCli(codexHome, archived ? ["ls", "--archived"] : ["ls"]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("Total 1 session");
      expect(stdout).toContain("demo  1 session");
      expect(stdout).toContain("Locked session");
      expect(stdout).toContain(archived ? "archived" : "active");
    }
  } finally {
    db.close();
  }
});

test("missing state database is reported as not installed", async () => {
  const codexHome = await createCodexHome();
  const { exitCode, stderr } = await runCli(codexHome);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("Codex state database not found:");
  expect(stderr).toContain("Is Codex installed?");
});

test("unavailable state database is not reported as missing", async () => {
  const codexHome = await createCodexHome();
  await mkdir(join(codexHome, "state_5.sqlite"));
  const { exitCode, stderr } = await runCli(codexHome);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("Codex state database is temporarily unavailable:");
  expect(stderr).toContain("Wait a moment, then try again.");
  expect(stderr).not.toContain("Is Codex installed?");
  expect(stderr).not.toContain(" at ");
});

test("incompatible state database is reported as unsupported", async () => {
  const codexHome = await createCodexHome();
  const db = new Database(join(codexHome, "state_5.sqlite"), { create: true, readwrite: true });
  db.run("CREATE TABLE unrelated (id TEXT)");
  db.close();
  const { exitCode, stderr } = await runCli(codexHome);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("This Codex storage format is not supported yet:");
  expect(stderr).toContain("Missing expected fields:");
  expect(stderr).not.toContain("Is Codex installed?");
});

async function runCli(codexHome: string, args: string[] = ["ls"]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: { ...Bun.env, CODEX_HOME: codexHome, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function createCodexHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dexcow-cli-"));
  tempDirs.push(root);
  return root;
}

test("interactive back keeps selections separate across repos and restores them on return", async () => {
  const root = await createPickerFixture();
  const events = await runPicker(root, [0, { back: "first" }, 1, "first", 0, "cancel"]);
  expect(events.map((event) => event.kind)).toEqual(["select", "multiselect", "select", "multiselect", "select", "multiselect"]);
  expect(events[2].initialValue).toBe(events[0].values[0]);
  expect(events[3].values).not.toEqual(events[1].values);
  expect(events[3].initialValues).toEqual([]);
  expect(events[5].initialValues).toEqual(["thread-1"]);
  expect(events[4].labels).toContain("Review selected (2)");
  expectRemainingThreads(root, 2);
});

test("declining confirmation returns to repos and preserves the combined selection", async () => {
  const root = await createPickerFixture();
  const events = await runPicker(root, [0, "first", "review", 0, 0, "cancel"]);
  expect(events.map((event) => event.kind)).toEqual(["select", "multiselect", "select", "select", "select", "multiselect"]);
  expect(events[5].initialValues).toEqual([events[1].values[0]]);
  expectRemainingThreads(root, 2);
});

test("a locked-only repo offers Back and the repo picker can exit", async () => {
  const root = await createLockedSessionFixture();
  const events = await runPicker(root, [0, 0, "cancel"]);
  expect(events.map((event) => event.kind)).toEqual(["select", "select", "select"]);
  expect(events[1].values).toEqual(["back"]);
  expectRemainingThreads(root, 1);
});

test("archived picker supports going back with a single repo", async () => {
  const root = await createPickerFixture();
  const db = new Database(join(root, "state_5.sqlite"));
  db.run("UPDATE threads SET archived = 1 WHERE id = 'thread-1'");
  db.close();
  const events = await runPicker(root, [0, [], "cancel"], "archived");
  expect(events.map((event) => event.kind)).toEqual(["select", "multiselect", "select"]);
  expect(events[1].values).toEqual(["thread-1"]);
  expectRemainingThreads(root, 2);
});

test("one confirmation deletes selected sessions from both repos", async () => {
  const root = await createPickerFixture();
  const events = await runPicker(root, [0, { back: "first" }, 1, "first", "review", 1]);
  expect(events[5].values).toEqual(["no", "yes"]);
  expectRemainingThreads(root, 0);
  expect(await Bun.file(join(root, "sessions", "thread-1.jsonl")).exists()).toBe(false);
  expect(await Bun.file(join(root, "sessions", "thread-2.jsonl")).exists()).toBe(false);
});

test("Esc from review and quitting leave both repos untouched", async () => {
  const root = await createPickerFixture();
  const events = await runPicker(root, [0, "first", 1, "first", "review", "back", "cancel"]);
  expect(events[6].labels).toContain("Review selected (2)");
  expectRemainingThreads(root, 2);
});

test("quitting confirmation does not delete selected sessions", async () => {
  const root = await createPickerFixture();
  await runPicker(root, [0, "first", "review", "cancel"]);
  expectRemainingThreads(root, 2);
});

test("newly locked sessions are removed from the saved selection", async () => {
  const root = await createPickerFixture();
  const events = await runPicker(root, [0, { lock: "thread-1" }, "cancel"]);
  expect(events[2].values).not.toContain("review");
  expectRemainingThreads(root, 2);
});

interface PickerEvent {
  kind: string;
  values: string[];
  labels: string[];
  initialValue?: string;
  initialValues?: string[];
}

async function runPicker(root: string, responses: unknown[], scope = "active"): Promise<PickerEvent[]> {
  // Isolate prompt mocks in a child process; use real discovery and stores in the fixture.
  const script = `
    import { mock } from "bun:test";
    import { writeFileSync } from "node:fs";
    const responses = ${JSON.stringify(responses)};
    const events = [];
    function answer(kind, options) {
      events.push({ kind, values: options.options?.map(option => option.value) ?? [],
        labels: options.options?.map(option => option.label) ?? [],
        initialValue: options.initialValue, initialValues: options.initialValues });
      if (!responses.length) throw new Error("Unexpected prompt: " + options.message);
      const response = responses.shift();
      if (response?.lock) {
        writeFileSync(process.env.CODEX_HOME + "/thread-writer-locks/" + response.lock + ".lock", "");
        return { action: "back", value: [response.lock] };
      }
      if (response === "cancel") return { action: "quit", value: options.initialValues ?? options.initialValue };
      if (response === "back") return { action: "back", value: options.initialValues ?? options.initialValue };
      if (response?.back === "first") return { action: "back", value: [options.options[0].value] };
      if (response === "first") return { action: "submit", value: [options.options[0].value] };
      if (response === "review") return { action: "submit", value: "review" };
      if (kind === "select") return { action: "submit", value: options.options[response].value };
      return { action: "submit", value: response };
    }
    mock.module("@clack/prompts", () => ({
      intro() {}, note() {}, outro() {},
    }));
    mock.module("./src/navigation.ts", () => ({
      select: options => answer("select", options),
      multiselect: options => answer("multiselect", options),
    }));
    const { runInteractive } = await import("./src/commands.ts");
    await runInteractive(${JSON.stringify(scope)});
    if (responses.length) throw new Error("Unused prompt responses");
    console.log(JSON.stringify(events));
  `;
  const child = Bun.spawn(["bun", "--eval", script], {
    cwd: join(import.meta.dir, ".."),
    env: { ...Bun.env, CODEX_HOME: root, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return JSON.parse(stdout);
}

async function createPickerFixture(): Promise<string> {
  const root = await createLockedSessionFixture();
  await rm(join(root, "thread-writer-locks", "thread-1.lock"));
  const db = new Database(join(root, "state_5.sqlite"));
  try {
    db.run("CREATE TABLE thread_dynamic_tools (thread_id TEXT)");
    db.run("CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT)");
    db.run(`INSERT INTO threads SELECT 'thread-2', rollout_path, '/tmp/second',
      'git@github.com:demo/second.git', 'Second session', 0, 0, 'cli', NULL FROM threads`);
    db.query("UPDATE threads SET rollout_path = ? WHERE id = ?").run(join(root, "sessions", "thread-2.jsonl"), "thread-2");
  } finally {
    db.close();
  }
  await mkdir(join(root, "sessions"));
  await writeFile(join(root, "sessions", "thread-1.jsonl"), "{}");
  await writeFile(join(root, "sessions", "thread-2.jsonl"), "{}");
  return root;
}

function expectRemainingThreads(root: string, count: number): void {
  const db = new Database(join(root, "state_5.sqlite"), { readonly: true });
  try {
    expect(db.query("SELECT count(*) AS count FROM threads").get()).toEqual({ count });
  } finally {
    db.close();
  }
}

async function createLockedSessionFixture(): Promise<string> {
  const root = await createCodexHome();
  const locksRoot = join(root, "thread-writer-locks");
  await mkdir(locksRoot);
  await writeFile(join(locksRoot, "thread-1.lock"), "", "utf8");

  const db = new Database(join(root, "state_5.sqlite"), { create: true, readwrite: true });
  try {
    db.run("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, cwd TEXT NOT NULL, git_origin_url TEXT, title TEXT NOT NULL, updated_at INTEGER NOT NULL, archived INTEGER NOT NULL, thread_source TEXT, name TEXT)");
    db.query("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "thread-1",
      join(root, "sessions", "thread-1.jsonl"),
      "/tmp/demo",
      "git@github.com:demo/repo.git",
      "Locked session",
      1,
      0,
      "cli",
      null,
    );
  } finally {
    db.close();
  }
  return root;
}
