import * as p from "@clack/prompts";
import pc from "picocolors";
import { purgeThreads, type PurgeResult } from "./purge.ts";
import { findLockedThreadIds } from "./sessionArtifacts.ts";
import { listThreads, openDb, type Thread, type ThreadScope } from "./threads.ts";
import {
  formatThreadGroups,
  groupThreadsByProject,
  threadGroupLabel,
  relativeTime,
  truncate,
} from "./format.ts";
import { renderRepoOptionLabel } from "./repoOption.ts";
import * as navigation from "./navigation.ts";

const REVIEW = "review";

export async function runInteractive(scope: ThreadScope = "active"): Promise<void> {
  p.intro(pc.bgMagenta(pc.black(" dexcow ")) + pc.dim(" cow eats Codex sessions"));

  const db = openDb();
  try {
    let previousGroupId: string | undefined;
    const selectedIds = new Set<string>();
    while (true) {
      const threads = await listThreads(db, { scope });
      if (threads.length === 0) {
        p.note(scope === "archived" ? "No archived Codex sessions found." : "No Codex sessions found.", "empty");
        p.outro("nothing to eat 🐄");
        return;
      }

      const lockedIds = new Set(findLockedThreadIds(new Set(threads.map((thread) => thread.id))));
      const availableIds = new Set(threads.filter((thread) => !lockedIds.has(thread.id)).map((thread) => thread.id));
      let removed = 0;
      for (const id of selectedIds) {
        if (!availableIds.has(id)) {
          selectedIds.delete(id);
          removed++;
        }
      }
      if (removed > 0) p.note(`${removed} selected session(s) are now locked or unavailable.`, "removed from selection");

      const groups = groupThreadsByProject(threads);
      const repoOptions = groups.map((group) => {
        const count = group.threads.filter((thread) => selectedIds.has(thread.id)).length;
        return {
          value: group.id,
          label: renderRepoOptionLabel(group, groups, lockedIds) + (count ? pc.cyan(`  ${count} selected`) : ""),
        };
      });
      if (selectedIds.size > 0) repoOptions.push({ value: REVIEW, label: pc.cyan(`Review selected (${selectedIds.size})`) });
      const target = await navigation.select({
        message: "Pick a repo",
        hints: "up/down move | enter open | esc no action | q quit",
        options: repoOptions,
        initialValue: repoOptions.some((option) => option.value === previousGroupId) ? previousGroupId : undefined,
        back: false,
      });
      if (target.action === "quit") {
        exitCleanly("exited; no changes made");
        return;
      }

      previousGroupId = target.value;
      if (target.value !== REVIEW) {
        const group = groups.find((item) => item.id === target.value)!;
        const currentLockedIds = new Set(findLockedThreadIds(new Set(group.threads.map((thread) => thread.id))));
        const lockedThreads = group.threads.filter((thread) => currentLockedIds.has(thread.id));
        const availableThreads = group.threads.filter((thread) => !currentLockedIds.has(thread.id));
        if (lockedThreads.length > 0) {
          p.note(lockedThreads.map(renderLockedLine).join("\n"), "open in Codex; unavailable");
        }
        if (availableThreads.length === 0) {
          const back = await navigation.select({
            message: "All sessions are locked",
            hints: "enter/esc back | q quit",
            options: [{ value: "back", label: "Back to repos" }],
          });
          if (back.action === "quit") {
            exitCleanly("exited; no changes made");
            return;
          }
          continue;
        }

        const picked = await navigation.multiselect({
          message: `Pick sessions: ${threadGroupLabel(group, groups)}`,
          hints: "space select | enter/esc back | q quit",
          options: availableThreads.map((thread) => ({
            value: thread.id,
            label: renderSessionOptionLabel(thread),
          })),
          initialValues: availableThreads.filter((thread) => selectedIds.has(thread.id)).map((thread) => thread.id),
        });

        if (picked.action === "quit") {
          exitCleanly("exited; no changes made");
          return;
        }
        for (const thread of group.threads) selectedIds.delete(thread.id);
        for (const id of picked.value) selectedIds.add(id);
        continue;
      }

      // Refresh the selected records and locks immediately before showing the combined review.
      const currentThreads = await listThreads(db, { scope });
      const reviewLockedIds = new Set(findLockedThreadIds(selectedIds));
      const chosen = currentThreads.filter((thread) => selectedIds.has(thread.id) && !reviewLockedIds.has(thread.id));
      if (chosen.length !== selectedIds.size) {
        p.note("Some selected sessions are now locked or unavailable. Review your selection again.", "selection changed");
        continue;
      }
      if (chosen.length === 0) continue;
      p.note(formatThreadGroups(chosen), "selected");
      const confirmed = await navigation.select({
        message: `Permanently delete ${chosen.length} session(s)?`,
        hints: "up/down choose | enter confirm | esc back | q quit",
        options: [{ value: "no", label: "No, go back" }, { value: "yes", label: "Yes, delete" }],
        initialValue: "no",
      });
      if (confirmed.action === "quit") {
        exitCleanly("exited; no changes made");
        return;
      }
      if (confirmed.action === "back" || confirmed.value !== "yes") continue;

      const result = await purgeThreads(db, chosen, {});
      p.outro(summarize(result) + refreshNote());
      return;
    }
  } finally {
    db.close();
  }
}

export async function runList(scope: ThreadScope = "active"): Promise<void> {
  const db = openDb();
  try {
    const threads = await listThreads(db, { scope });
    if (threads.length === 0) {
      console.log("(no sessions)");
      return;
    }
    const lockedIds = new Set(findLockedThreadIds(new Set(threads.map((thread) => thread.id))));
    console.log(formatThreadGroups(threads, lockedIds));
  } finally {
    db.close();
  }
}

export async function runRemove(ids: string[], confirmed: boolean): Promise<void> {
  if (ids.length === 0) {
    console.error("usage: dexcow rm <id> [id...] --yes");
    process.exit(2);
  }
  if (!confirmed) {
    console.error("refusing permanent deletion without --yes");
    process.exit(2);
  }
  const db = openDb();
  try {
    const threads = await listThreads(db, { scope: "all" });
    const byId = new Map(threads.map((t) => [t.id, t]));
    const chosen: Thread[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) {
        console.error(pc.yellow(`skip: ${id} not found`));
        continue;
      }
      chosen.push(t);
    }
    const result = await purgeThreads(db, chosen, {});
    console.log(summarize(result) + refreshNote());
  } finally {
    db.close();
  }
}

function summarize(r: PurgeResult): string {
  const main = `deleted ${r.removed} session(s)`;
  const details = [
    `${r.stateRows} state row(s)`,
    `${r.logRows} log row(s)`,
    `${r.sessionIndexRows} index row(s)`,
  ];
  if (r.catalogRows > 0) details.push(`${r.catalogRows} catalog row(s)`);
  if (r.timelineRows > 0) details.push(`${r.timelineRows} timeline row(s)`);
  if (r.historySnapshotRows > 0) details.push(`${r.historySnapshotRows} history snapshot(s)`);
  if (r.automationRunRows > 0) details.push(`${r.automationRunRows} automation run(s)`);
  if (r.inboxRows > 0) details.push(`${r.inboxRows} inbox item(s)`);
  if (r.shellSnapshots > 0) details.push(`${r.shellSnapshots} shell snapshot(s)`);
  if (r.missingFiles > 0) details.push(`${r.missingFiles} rollout file(s) already missing`);
  const note = pc.dim(` (${details.join(", ")})`);
  return main + note;
}

function refreshNote(): string {
  return pc.dim("\nrefresh Codex if old sessions still appear (collapse or expand the repo usually works)");
}

function exitCleanly(message: string): void {
  p.outro(pc.dim(message));
}

function renderSessionOptionLabel(t: Thread): string {
  const age = relativeTime(t.updatedAt).padStart(4);
  const width = Math.max(8, Math.min(54, (process.stdout.columns || 80) - 26));
  const title = truncate(t.title, width).padEnd(width);
  const tag = t.archived ? pc.yellow("archived") : pc.green("active  ");
  return `${pc.dim(age)}  ${title}  ${tag}`;
}

function renderLockedLine(t: Thread): string {
  const age = relativeTime(t.updatedAt).padStart(4);
  const title = truncate(t.title, 62);
  return `${pc.dim(age)}  ${title}  ${pc.yellow("locked")}`;
}
