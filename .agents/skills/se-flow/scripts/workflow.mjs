#!/usr/bin/env node

// Persistent Phase 0-4 controller for se-flow. Runtime state is kept in the
// Git common directory; ownership tokens are never printed by this command.
import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCK_CLI = path.join(SCRIPT_DIR, "repo-lock.mjs");
const TERMINAL = new Set(["COMPLETED", "PARTIAL", "BLOCKED"]);
const STATES = new Set(["LOCKED", "INTAKE_READY", "FRESHNESS_PASSED", "PLAN_READY", "BRANCH_READY", "IMPLEMENTING", "VERIFYING", "REVIEWING", "DELIVERING", ...TERMINAL]);
const TRANSITIONS = {
  LOCKED: ["INTAKE_READY"], INTAKE_READY: ["FRESHNESS_PASSED"],
  FRESHNESS_PASSED: ["PLAN_READY"], PLAN_READY: ["BRANCH_READY"],
  BRANCH_READY: ["IMPLEMENTING"], IMPLEMENTING: ["VERIFYING"],
  VERIFYING: ["REVIEWING"], REVIEWING: ["DELIVERING"],
  DELIVERING: ["COMPLETED"],
};

function parse(argv) {
  const [command, ...args] = argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Expected a value after ${args[i]}.`);
    options[args[i].slice(2)] = args[++i];
  }
  return { command, options };
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error(`Git could not run: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) throw new Error((result.stderr || `git ${args.join(" ")} failed`).trim());
  return { code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function locate(cwd) {
  let dir = path.resolve(cwd);
  while (true) {
    const marker = path.join(dir, ".git");
    try {
      const markerStat = await lstat(marker);
      const content = markerStat.isDirectory() ? null : await readFile(marker, "utf8");
      const match = content?.match(/^gitdir:\s*(.+)$/im);
      if (content !== null && !match) throw new Error(`Invalid .git pointer: ${marker}`);
      const gitDir = content === null ? marker : path.resolve(dir, match[1].trim());
      const commonText = await readFile(path.join(gitDir, "commondir"), "utf8").catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
      const commonDir = path.resolve(gitDir, commonText?.trim() || ".");
      return { root: dir, commonDir, dataDir: path.join(commonDir, "se-flow-workflows") };
    } catch (error) {
      if (!new Set(["ENOENT", "ENOTDIR"]).has(error.code)) throw error;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No Git repository found from ${cwd}.`);
    dir = parent;
  }
}

function paths(repo, id) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id || "")) throw new Error("Invalid workflow ID.");
  const base = path.join(repo.dataDir, id);
  return { state: `${base}.json`, token: `${base}.token`, guard: `${base}.guard` };
}

async function verify(repo, token) {
  if (!token) throw new Error("Workflow ownership token is unavailable; stop and inspect the lock.");
  const result = spawnSync(process.execPath, [LOCK_CLI, "verify", "--token", token], { cwd: repo.root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Repository lock verification failed: ${(result.stderr || "unknown error").trim()}`);
}

async function mutate(repo, id, action) {
  const p = paths(repo, id);
  await mkdir(repo.dataDir, { recursive: true, mode: 0o700 });
  try { await mkdir(p.guard, { mode: 0o700 }); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`BLOCKED: workflow mutation guard exists at ${p.guard}; inspect and manually remove only after confirming no controller process is active.`);
    throw error;
  }
  try {
    const state = JSON.parse(await readFile(p.state, "utf8"));
    if (state.lockReleasedAt) throw new Error(`Workflow already terminated as ${state.phase}; refusing a duplicate lock release.`);
    const token = await readFile(p.token, "utf8");
    await verify(repo, token.trim());
    const result = await action(state, token.trim(), p);
    state.updatedAt = new Date().toISOString();
    const temp = `${p.state}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temp, p.state);
    if (state.lockReleasedAt) await rm(p.token, { force: false });
    return result ?? state;
  } finally {
    await rmdir(p.guard);
  }
}

async function start(repo, opts) {
  const ticket = opts.ticket;
  if (!ticket) throw new Error("start requires --ticket.");
  const mode = opts.mode || "full";
  const delivery = opts.delivery || "local";
  if (!new Set(["full", "plan"]).has(mode) || !new Set(["local", "pr"]).has(delivery)) throw new Error("mode must be full|plan and delivery must be local|pr.");
  const id = randomUUID();
  const args = [LOCK_CLI, "acquire", "--ticket", ticket, "--session-id", id];
  const acquired = spawnSync(process.execPath, args, { cwd: repo.root, encoding: "utf8", windowsHide: true });
  if (acquired.status !== 0) throw new Error(acquired.stderr.trim() || "Repository lock acquisition failed.");
  const lock = JSON.parse(acquired.stdout);
  await mkdir(repo.dataDir, { recursive: true, mode: 0o700 });
  const p = paths(repo, id);
  const state = { id, ticket, mode, delivery, phase: "LOCKED", lockAcquiredAt: lock.acquiredAt, workspace: repo.root, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), freshness: null };
  try {
    await writeFile(p.token, `${lock.ownershipToken}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(p.state, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    // A crash here is recoverable by explicit lock recovery; never auto-release.
    throw new Error(`Lock acquired but workflow state persistence failed; preserve the lock and recover manually: ${error.message}`);
  }
  console.log(JSON.stringify({ id, phase: state.phase, ticket, mode: state.mode, delivery: state.delivery }));
}

async function freshness(repo, id) {
  await mutate(repo, id, async (state, token) => {
    if (!["INTAKE_READY", "FRESHNESS_PASSED", "PLAN_READY"].includes(state.phase)) throw new Error(`Freshness is only allowed before branch preparation (current: ${state.phase}).`);
    state.phase = "INTAKE_READY";
    state.freshness = null;
    await verify(repo, token);
    const branch = git(repo.root, ["branch", "--show-current"], { allowFailure: true }).stdout;
    const head = git(repo.root, ["rev-parse", "HEAD"]).stdout;
    const status = git(repo.root, ["status", "--porcelain=v1", "-z"]).stdout;
    const remotes = git(repo.root, ["remote"]).stdout.split(/\r?\n/).filter(Boolean);
    if (!remotes.length) return block(state, "No configured remote; cannot verify freshness.");
    const tracking = git(repo.root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { allowFailure: true }).stdout;
    let remote = tracking.includes("/") ? tracking.split("/")[0] : remotes.length === 1 ? remotes[0] : "";
    if (!remote || !remotes.includes(remote)) return block(state, "Remote selection is ambiguous; configure a tracking branch or one authoritative remote.");
    await verify(repo, token);
    const fetched = git(repo.root, ["fetch", remote], { allowFailure: true });
    if (fetched.code !== 0) return block(state, `Fetch failed: ${fetched.stderr}`);
    let baseRef = git(repo.root, ["symbolic-ref", `refs/remotes/${remote}/HEAD`], { allowFailure: true }).stdout;
    if (!baseRef) {
      const symref = git(repo.root, ["ls-remote", "--symref", remote, "HEAD"], { allowFailure: true }).stdout;
      baseRef = symref.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m)?.[1] ? `refs/remotes/${remote}/${symref.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m)[1]}` : "";
    }
    if (!baseRef || !git(repo.root, ["show-ref", "--verify", baseRef], { allowFailure: true }).stdout) return block(state, "Could not identify and verify the authoritative remote default branch.");
    const baseSha = git(repo.root, ["rev-parse", baseRef]).stdout;
    let ahead = null; let behind = null; let sync = state.mode === "plan" ? "not-performed-plan" : "not-performed";
    let analysisBaseline = state.mode === "plan" ? baseSha : head;
    const dirty = Boolean(status);
    const initialCounts = git(repo.root, ["rev-list", "--left-right", "--count", `HEAD...${baseRef}`], { allowFailure: true });
    if (initialCounts.code === 0) [ahead, behind] = initialCounts.stdout.split(/\s+/).map(Number);
    if (state.mode === "full") {
      if (dirty) return block(state, "Working tree has uncommitted changes; full-mode synchronization is unsafe.");
      if (!branch) {
        if (head !== baseSha) return block(state, "Detached HEAD does not point at the latest authoritative base commit.");
        sync = "detached-base-current";
        analysisBaseline = baseSha;
      } else if (branch === baseRef.split("/").at(-1)) {
        if (ahead === 0 && behind > 0) {
          await verify(repo, token);
          git(repo.root, ["merge", "--ff-only", baseSha]);
          sync = "fast-forwarded";
          [ahead, behind] = git(repo.root, ["rev-list", "--left-right", "--count", `HEAD...${baseRef}`]).stdout.split(/\s+/).map(Number);
        } else if (ahead === 0 && behind === 0) sync = "already-current";
        else if (ahead > 0 && behind === 0) return block(state, "Current base branch is ahead of remote base; refusing to treat it as synchronized.");
        else if (ahead && behind) return block(state, "Current base branch diverges from remote base; automatic merge/rebase is prohibited.");
        analysisBaseline = git(repo.root, ["rev-parse", "HEAD"]).stdout;
      } else {
        if (behind > 0) return block(state, "Current feature branch does not contain the latest remote base; automatic merge/rebase is prohibited.");
        sync = "feature-branch-unchanged";
      }
    }
    const localHead = git(repo.root, ["rev-parse", "HEAD"]).stdout;
    const fingerprint = createHash("sha256").update(JSON.stringify({ branch, localHead, status, baseRef, baseSha })).digest("hex");
    state.freshness = { status: "PASS", branch: branch || "(detached)", localHead, remote, baseRef, baseSha, ahead, behind, synchronization: sync, analysisBaseline, fingerprint, fetchedAt: new Date().toISOString(), dirty };
    state.phase = "FRESHNESS_PASSED";
    console.log(JSON.stringify(state.freshness, null, 2));
  });
}

function block(state, reason) {
  state.phase = "BLOCKED";
  state.freshness = { status: "BLOCKED", reason, checkedAt: new Date().toISOString() };
  console.log(JSON.stringify(state.freshness, null, 2));
}

async function assertFreshEvidence(repo, state, token) {
  const f = state.freshness;
  if (!f || f.status !== "PASS") throw new Error("A passing freshness gate is required.");
  await verify(repo, token);
  const fetched = git(repo.root, ["fetch", f.remote], { allowFailure: true });
  if (fetched.code !== 0) throw new Error(`Freshness revalidation fetch failed: ${fetched.stderr}`);
  const branch = git(repo.root, ["branch", "--show-current"], { allowFailure: true }).stdout || "(detached)";
  const head = git(repo.root, ["rev-parse", "HEAD"]).stdout;
  const status = git(repo.root, ["status", "--porcelain=v1", "-z"]).stdout;
  const baseSha = git(repo.root, ["rev-parse", f.baseRef], { allowFailure: true }).stdout;
  const fingerprint = createHash("sha256").update(JSON.stringify({ branch: branch === "(detached)" ? "" : branch, localHead: head, status, baseRef: f.baseRef, baseSha })).digest("hex");
  if (fingerprint !== f.fingerprint || baseSha !== f.baseSha) throw new Error("Freshness evidence is stale because branch, HEAD, working tree, or remote base ref changed; rerun freshness.");
}

async function handle(repo, command, opts) {
  const id = opts.id;
  if (!id && command !== "start") throw new Error(`${command} requires --id.`);
  if (command === "start") return start(repo, opts);
  if (command === "status") {
    const p = paths(repo, id); const state = JSON.parse(await readFile(p.state, "utf8"));
    if (!state.lockReleasedAt) await verify(repo, (await readFile(p.token, "utf8")).trim());
    console.log(JSON.stringify(state, null, 2)); return;
  }
  if (command === "freshness") return freshness(repo, id);
  return mutate(repo, id, async (state, token, p) => {
    if (["complete", "abort"].includes(command)) {
      const next = command === "complete" ? "COMPLETED" : opts.result;
      if (command === "complete" && !(state.mode === "plan" ? state.phase === "PLAN_READY" : state.phase === "DELIVERING")) throw new Error("Cannot complete before the required terminal workflow phase.");
      if (command === "abort" && !["PARTIAL", "BLOCKED"].includes(next)) throw new Error("abort requires --result PARTIAL|BLOCKED.");
      if (!STATES.has(next)) throw new Error("Invalid terminal state.");
      const fromPhase = state.phase;
      const reason = command === "complete" ? null : opts.reason || (state.freshness?.status === "BLOCKED" ? state.freshness.reason : null);
      state.outcome = { result: next, reason, fromPhase, terminatedAt: new Date().toISOString() };
      await verify(repo, token);
      const released = spawnSync(process.execPath, [LOCK_CLI, "release", "--token", token], { cwd: repo.root, encoding: "utf8", windowsHide: true });
      if (released.status !== 0) throw new Error(`Lock release failed: ${released.stderr.trim()}`);
      state.phase = next; state.lockReleasedAt = new Date().toISOString();
      console.log(JSON.stringify({ id, phase: next, lockReleased: true })); return;
    }
    if (command === "intake") {
      if (state.phase !== "LOCKED") throw new Error(`Illegal transition from ${state.phase} to INTAKE_READY.`);
      state.phase = "INTAKE_READY"; console.log(JSON.stringify({ id, phase: state.phase })); return;
    }
    if (command === "plan") {
      if (state.phase !== "FRESHNESS_PASSED") throw new Error("plan requires FRESHNESS_PASSED.");
      await assertFreshEvidence(repo, state, token);
      state.phase = "PLAN_READY"; console.log(JSON.stringify({ id, phase: state.phase, baseline: state.freshness.analysisBaseline })); return;
    }
    if (command === "branch") {
      if (state.mode !== "full") throw new Error("Plan mode never creates or switches branches.");
      if (state.phase !== "PLAN_READY") throw new Error("branch requires PLAN_READY.");
      await assertFreshEvidence(repo, state, token);
      if (state.freshness.dirty) throw new Error("Cannot prepare a branch with uncommitted changes.");
      const issue = opts.issue;
      const name = opts.name || (issue ? `issue/${issue}` : "");
      if (!name || name.startsWith("-") || name.includes("..")) throw new Error("branch requires a safe --name or --issue number.");
      if (git(repo.root, ["check-ref-format", "--branch", name], { allowFailure: true }).code !== 0) throw new Error("Invalid Git branch name.");
      const current = git(repo.root, ["branch", "--show-current"], { allowFailure: true }).stdout;
      const exists = git(repo.root, ["show-ref", "--verify", `refs/heads/${name}`], { allowFailure: true }).code === 0;
      if (exists && current !== name) throw new Error("Issue branch already exists but is not checked out; refusing an automatic switch.");
      if (!exists) {
        const head = git(repo.root, ["rev-parse", "HEAD"]).stdout;
        const atVerifiedBase = head === state.freshness.baseSha;
        const onBaseBranch = current === state.freshness.baseRef.split("/").at(-1) && atVerifiedBase;
        const detachedAtBase = !current && atVerifiedBase;
        if (!onBaseBranch && !detachedAtBase) throw new Error("New issue branch must start from the verified latest base branch commit.");
        await verify(repo, token);
        git(repo.root, ["switch", "-c", name, state.freshness.baseSha]);
      } else {
        const baseIsAncestor = git(repo.root, ["merge-base", "--is-ancestor", state.freshness.baseSha, "HEAD"], { allowFailure: true }).code === 0;
        if (!baseIsAncestor) throw new Error("Existing issue branch is stale or diverged from latest base; refusing merge/rebase.");
      }
      const branch = git(repo.root, ["branch", "--show-current"]).stdout;
      const head = git(repo.root, ["rev-parse", "HEAD"]).stdout;
      if (branch !== name || (exists ? git(repo.root, ["merge-base", "--is-ancestor", state.freshness.baseSha, "HEAD"], { allowFailure: true }).code !== 0 : head !== state.freshness.baseSha)) throw new Error("Branch postcondition failed.");
      state.phase = "BRANCH_READY"; state.branch = { name, head, baseSha: state.freshness.baseSha };
      console.log(JSON.stringify({ id, phase: state.phase, ...state.branch })); return;
    }
    if (command === "advance") {
      const to = opts.to;
      if (!STATES.has(to) || TERMINAL.has(to) || !TRANSITIONS[state.phase]?.includes(to)) throw new Error(`Illegal workflow transition: ${state.phase} -> ${to}.`);
      if (["FRESHNESS_PASSED", "PLAN_READY", "BRANCH_READY"].includes(to)) throw new Error(`Use the dedicated ${to} command to satisfy its gate.`);
      if (state.mode === "plan" && ["IMPLEMENTING", "VERIFYING", "REVIEWING", "DELIVERING"].includes(to)) throw new Error("Plan mode stops before implementation.");
      await verify(repo, token);
      if (to === "IMPLEMENTING") {
        if (!state.branch || git(repo.root, ["branch", "--show-current"]).stdout !== state.branch.name || git(repo.root, ["rev-parse", "HEAD"]).stdout !== state.branch.head) throw new Error("Branch/HEAD changed after branch preparation; stop and revalidate before implementation.");
      }
      state.phase = to; console.log(JSON.stringify({ id, phase: to })); return;
    }
    throw new Error("Usage: workflow.mjs <start|status|intake|freshness|plan|branch|advance|complete|abort> --id <id>");
  });
}

const { command, options } = parse(process.argv.slice(2));
try {
  const repo = await locate(process.cwd());
  await handle(repo, command, options);
} catch (error) {
  console.error(error.message);
  process.exitCode = error.message.startsWith("BLOCKED:") ? 10 : 1;
}
