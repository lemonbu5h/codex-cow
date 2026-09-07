import pc from "picocolors";
import { describeStateDbPath } from "./codexStores.ts";

const MAIN_HELP = `${pc.bold("dexcow")} — a cow that eats your Codex sessions

${pc.bold("Usage:")}
  dexcow              Interactive picker (multiselect + delete)
  dexcow help         Show this help
  dexcow ls           List sessions shown in Codex
  dexcow archived     Pick from archived sessions
  dexcow rm <id...> --yes
                      Permanently delete specific sessions by id
  dexcow -h, --help   Show this help
  dexcow -v, --version

Pick sessions across repos, then choose "Review selected" to confirm deletion.
Space selects; enter/esc returns to repos and keeps selections. q quits.
Esc at confirmation goes back; Esc in the repo view does nothing.

${pc.bold("Data source:")}
  ${pc.dim(describeStateDbPath())}
`;

const COMMAND_HELP: Record<string, string> = {
  help: MAIN_HELP,
  ls: `${pc.bold("dexcow ls")}

${pc.bold("Usage:")}
  dexcow ls
  dexcow ls --archived

List active sessions shown in Codex. Use --archived to list archived sessions.
`,
  list: `${pc.bold("dexcow ls")}

${pc.bold("Usage:")}
  dexcow ls
  dexcow ls --archived

List active sessions shown in Codex. Use --archived to list archived sessions.
`,
  archived: `${pc.bold("dexcow archived")}

${pc.bold("Usage:")}
  dexcow archived

Open the interactive picker for sessions Codex has archived and hidden from its normal sidebar.
`,
  rm: `${pc.bold("dexcow rm")}

${pc.bold("Usage:")}
  dexcow rm <id...> --yes

Permanently delete specific sessions by id. The --yes flag is required.
`,
  delete: `${pc.bold("dexcow rm")}

${pc.bold("Usage:")}
  dexcow rm <id...> --yes

Permanently delete specific sessions by id. The --yes flag is required.
`,
};

export function helpFor(command?: string): string {
  if (!command) return MAIN_HELP;
  return COMMAND_HELP[command] ?? MAIN_HELP;
}
