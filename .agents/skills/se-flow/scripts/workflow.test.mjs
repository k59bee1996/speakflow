import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const controller = path.join(scripts, "workflow.mjs");
const lockCli = path.join(scripts, "repo-lock.mjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function cli(cwd, ...args) {
  return spawnSync(process.execPath, [controller, ...args], { cwd, encoding: "utf8", windowsHide: true });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "se-flow-workflow-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const local = path.join(dir, "local"); const bare = path.join(dir, "remote.git");
  execFileSync("git", ["init", "--bare", "--quiet", bare]);
  execFileSync("git", ["init", "--quiet", "--initial-branch=trunk", local]);
  git(local, "config", "user.name", "Workflow test");
  git(local, "config", "user.email", "workflow-test@example.invalid");
  await writeFile(path.join(local, "seed.txt"), "base\n");
  git(local, "add", "seed.txt"); git(local, "commit", "--quiet", "-m", "base");
  git(local, "remote", "add", "origin", bare); git(local, "push", "--quiet", "-u", "origin", "trunk");
  git(bare, "symbolic-ref", "HEAD", "refs/heads/trunk");
  git(local, "remote", "set-head", "origin", "--auto");
  return { dir, local, bare };
}

function start(local, mode = "full") {
  return parse(cli(local, "start", "--ticket", "temporary test task", "--mode", mode));
}

function run(local, id, command, ...args) {
  return cli(local, command, "--id", id, ...args);
}

function workflowStatePath(local, id) {
  return path.join(local, ".git", "se-flow-workflows", `${id}.json`);
}

function intakeAndFreshness(local, id) {
  parse(run(local, id, "intake"));
  return parse(run(local, id, "freshness"));
}

test("persistent lock ownership spans controller invocations; plan completes without source or branch mutation", async (t) => {
  const { local } = await fixture(t);
  const branch = git(local, "branch", "--show-current"); const head = git(local, "rev-parse", "HEAD");
  const workflow = start(local, "plan");
  const freshness = intakeAndFreshness(local, workflow.id);
  assert.equal(freshness.status, "PASS"); assert.equal(freshness.remote, "origin");
  parse(run(local, workflow.id, "plan"));
  assert.equal(git(local, "branch", "--show-current"), branch);
  assert.equal(git(local, "rev-parse", "HEAD"), head);
  const done = parse(run(local, workflow.id, "complete"));
  assert.equal(done.phase, "COMPLETED"); assert.equal(done.lockReleased, true);
  const status = parse(run(local, workflow.id, "status"));
  assert.equal(status.phase, "COMPLETED");
  assert.equal(status.outcome.result, "COMPLETED");
  assert.equal(status.outcome.fromPhase, "PLAN_READY");
  const second = start(local); assert.ok(second.id);
});

test("full mode fast-forwards a clean base branch and prepares issue branch from verified SHA", async (t) => {
  const { local, bare } = await fixture(t);
  const workflow = start(local);
  await writeFile(path.join(local, "remote-change.txt"), "new remote\n");
  git(local, "add", "remote-change.txt"); git(local, "commit", "--quiet", "-m", "remote update");
  git(local, "push", "--quiet", "origin", "trunk");
  git(local, "reset", "--hard", "HEAD~1");
  const expected = git(local, "ls-remote", "origin", "refs/heads/trunk").split(/\s+/)[0];
  parse(run(local, workflow.id, "intake"));
  const gate = parse(run(local, workflow.id, "freshness"));
  assert.equal(gate.status, "PASS"); assert.equal(gate.synchronization, "fast-forwarded");
  assert.equal(gate.ahead, 0); assert.equal(gate.behind, 0);
  assert.equal(gate.baseSha, expected); assert.equal(git(local, "rev-parse", "HEAD"), expected);
  parse(run(local, workflow.id, "plan"));
  const branch = parse(run(local, workflow.id, "branch", "--issue", "123"));
  assert.equal(branch.name, "issue/123"); assert.equal(branch.head, expected);
  assert.equal(git(local, "branch", "--show-current"), "issue/123");
});

test("dirty full checkout blocks; plan gate uses fetched remote snapshot without altering checkout", async (t) => {
  const { local } = await fixture(t);
  const full = start(local); parse(run(local, full.id, "intake"));
  await writeFile(path.join(local, "seed.txt"), "user edit\n");
  const blocked = parse(run(local, full.id, "freshness"));
  assert.equal(blocked.status, "BLOCKED"); assert.equal(git(local, "status", "--porcelain").length > 0, true);

  const { local: planRepo } = await fixture(t);
  const plan = start(planRepo, "plan");
  const before = git(planRepo, "rev-parse", "HEAD");
  const gate = intakeAndFreshness(planRepo, plan.id);
  assert.equal(gate.status, "PASS"); assert.equal(gate.analysisBaseline, gate.baseSha);
  assert.equal(git(planRepo, "rev-parse", "HEAD"), before);
});

test("diverged and stale detached bases block; latest detached base supports issue branch preparation", async (t) => {
  const { local, bare, dir } = await fixture(t);
  const w = start(local);
  git(local, "commit", "--allow-empty", "--quiet", "-m", "local-only");
  const clone = path.join(dir, "independent"); execFileSync("git", ["clone", "--quiet", bare, clone]);
  git(clone, "config", "user.name", "Workflow test"); git(clone, "config", "user.email", "workflow-test@example.invalid");
  await writeFile(path.join(clone, "remote-only"), "remote\n"); git(clone, "add", "remote-only"); git(clone, "commit", "--quiet", "-m", "remote-only"); git(clone, "push", "--quiet", "origin", "trunk");
  parse(run(local, w.id, "intake"));
  assert.equal(parse(run(local, w.id, "freshness")).status, "BLOCKED");

  const { local: detached } = await fixture(t); const w2 = start(detached);
  const verifiedBase = git(detached, "rev-parse", "HEAD");
  git(detached, "checkout", "--quiet", "--detach"); parse(run(detached, w2.id, "intake"));
  const detachedGate = parse(run(detached, w2.id, "freshness"));
  assert.equal(detachedGate.status, "PASS");
  assert.equal(detachedGate.synchronization, "detached-base-current");
  assert.equal(detachedGate.baseSha, verifiedBase);
  parse(run(detached, w2.id, "plan"));
  const branch = parse(run(detached, w2.id, "branch", "--issue", "125"));
  assert.equal(branch.name, "issue/125");
  assert.equal(branch.head, verifiedBase);
  assert.equal(git(detached, "branch", "--show-current"), "issue/125");

  const { local: staleDetached } = await fixture(t); const w3 = start(staleDetached);
  git(staleDetached, "commit", "--allow-empty", "--quiet", "-m", "local-only");
  git(staleDetached, "checkout", "--quiet", "--detach"); parse(run(staleDetached, w3.id, "intake"));
  assert.equal(parse(run(staleDetached, w3.id, "freshness")).status, "BLOCKED");

  const { local: noRemote } = await fixture(t); const w4 = start(noRemote);
  git(noRemote, "remote", "remove", "origin"); parse(run(noRemote, w4.id, "intake"));
  assert.equal(parse(run(noRemote, w4.id, "freshness")).status, "BLOCKED");
});

test("stale evidence and illegal transitions are rejected; plan mode never creates a branch", async (t) => {
  const { local } = await fixture(t); const w = start(local, "plan");
  assert.notEqual(run(local, w.id, "advance", "--to", "BRANCH_READY").status, 0);
  const gate = intakeAndFreshness(local, w.id); assert.equal(gate.status, "PASS");
  git(local, "commit", "--allow-empty", "--quiet", "-m", "local drift");
  assert.notEqual(run(local, w.id, "plan").status, 0);

  const { local: planRepo } = await fixture(t); const plan = start(planRepo, "plan");
  intakeAndFreshness(planRepo, plan.id); parse(run(planRepo, plan.id, "plan"));
  const branchBefore = git(planRepo, "branch", "--show-current");
  assert.notEqual(run(planRepo, plan.id, "branch", "--issue", "124").status, 0);
  assert.equal(git(planRepo, "branch", "--show-current"), branchBefore);
  assert.notEqual(spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/issue/124"], { cwd: planRepo }).status, 0);
});

test("remote ref changes invalidate evidence and require a new freshness gate", async (t) => {
  const { local, bare, dir } = await fixture(t); const w = start(local, "plan");
  const first = intakeAndFreshness(local, w.id);
  const clone = path.join(dir, "remote-advance"); execFileSync("git", ["clone", "--quiet", bare, clone]);
  git(clone, "config", "user.name", "Workflow test"); git(clone, "config", "user.email", "workflow-test@example.invalid");
  await writeFile(path.join(clone, "later.txt"), "later\n"); git(clone, "add", "later.txt"); git(clone, "commit", "--quiet", "-m", "later base"); git(clone, "push", "--quiet", "origin", "trunk");
  assert.notEqual(run(local, w.id, "plan").status, 0);
  const updated = parse(run(local, w.id, "freshness"));
  assert.equal(updated.status, "PASS"); assert.notEqual(updated.baseSha, first.baseSha);
  assert.equal(parse(run(local, w.id, "plan")).phase, "PLAN_READY");
});

test("existing stale issue branch is rejected and controlled abort releases lock", async (t) => {
  const { local } = await fixture(t);
  git(local, "switch", "--quiet", "-c", "issue/77");
  await writeFile(path.join(local, "feature.txt"), "feature\n"); git(local, "add", "feature.txt"); git(local, "commit", "--quiet", "-m", "feature");
  git(local, "switch", "--quiet", "trunk"); await writeFile(path.join(local, "base-next"), "x\n"); git(local, "add", "base-next"); git(local, "commit", "--quiet", "-m", "base next"); git(local, "push", "--quiet", "origin", "trunk");
  git(local, "switch", "--quiet", "issue/77");
  const staleWorkflow = start(local); parse(run(local, staleWorkflow.id, "intake"));
  assert.equal(parse(run(local, staleWorkflow.id, "freshness")).status, "BLOCKED");
  const aborted = parse(run(local, staleWorkflow.id, "abort", "--result", "PARTIAL"));
  assert.equal(aborted.phase, "PARTIAL");
  assert.equal((await readFile(path.join(local, ".git", "se-flow.lock", "owner.json"), "utf8").then(() => true, () => false)), false);
});

test("BLOCKED abort safely releases its own lock and lets another session acquire", async (t) => {
  const { local } = await fixture(t);
  const workflow = start(local);
  parse(run(local, workflow.id, "intake"));

  const aborted = parse(run(local, workflow.id, "abort", "--result", "BLOCKED", "--reason", "External dependency unavailable."));
  assert.equal(aborted.phase, "BLOCKED");
  assert.equal(aborted.lockReleased, true);
  const state = JSON.parse(await readFile(workflowStatePath(local, workflow.id), "utf8"));
  assert.deepEqual(state.outcome, {
    result: "BLOCKED",
    reason: "External dependency unavailable.",
    fromPhase: "INTAKE_READY",
    terminatedAt: state.outcome.terminatedAt,
  });
  assert.equal(await readFile(path.join(local, ".git", "se-flow.lock", "owner.json"), "utf8").then(() => true, () => false), false);

  const next = start(local);
  assert.equal(parse(run(local, next.id, "status")).phase, "LOCKED");
});

test("GitHub access failure abort preserves its diagnostic as BLOCKED", async (t) => {
  const { local } = await fixture(t);
  const workflow = start(local);
  parse(run(local, workflow.id, "intake"));
  const reason = "GitHub MCP returned 404 for repository metadata and issue #1; authenticated gh access succeeded.";

  const aborted = parse(run(local, workflow.id, "abort", "--result", "BLOCKED", "--reason", reason));
  assert.equal(aborted.phase, "BLOCKED");
  const state = JSON.parse(await readFile(workflowStatePath(local, workflow.id), "utf8"));
  assert.equal(state.outcome.result, "BLOCKED");
  assert.equal(state.outcome.reason, reason);
  assert.equal(state.outcome.fromPhase, "INTAKE_READY");
});

test("invalid persisted ownership token cannot release a BLOCKED workflow lock", async (t) => {
  const { local } = await fixture(t);
  const workflow = start(local);
  parse(run(local, workflow.id, "intake"));
  const tokenPath = path.join(local, ".git", "se-flow-workflows", `${workflow.id}.token`);
  const token = await readFile(tokenPath, "utf8");
  await writeFile(tokenPath, "invalid ownership token\n");

  const rejected = run(local, workflow.id, "abort", "--result", "BLOCKED");
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /lock verification failed/i);
  assert.equal(await readFile(path.join(local, ".git", "se-flow.lock", "owner.json"), "utf8").then(() => true, () => false), true);
  assert.equal(JSON.parse(await readFile(workflowStatePath(local, workflow.id), "utf8")).phase, "INTAKE_READY");

  await writeFile(tokenPath, token);
  assert.equal(parse(run(local, workflow.id, "abort", "--result", "BLOCKED")).phase, "BLOCKED");
});

test("repeated abort cannot release a later session's lock or relabel the old outcome", async (t) => {
  const { local } = await fixture(t);
  const first = start(local);
  parse(run(local, first.id, "intake"));
  assert.equal(parse(run(local, first.id, "abort", "--result", "BLOCKED")).phase, "BLOCKED");

  const second = start(local);
  const repeated = run(local, first.id, "abort", "--result", "PARTIAL");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /already terminated as BLOCKED/i);
  assert.equal(parse(run(local, second.id, "status")).phase, "LOCKED");
  assert.equal(JSON.parse(await readFile(workflowStatePath(local, first.id), "utf8")).outcome.result, "BLOCKED");
});

test("two workflow sessions contend; invalid state guard fails closed and persisted ownership verifies cross-process", async (t) => {
  const { local } = await fixture(t); const owner = start(local);
  const blocked = cli(local, "start", "--ticket", "second task");
  assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /BLOCKED/);
  parse(run(local, owner.id, "status"));
  const guard = path.join(local, ".git", "se-flow-workflows", `${owner.id}.guard`);
  await (await import("node:fs/promises")).mkdir(guard);
  assert.notEqual(run(local, owner.id, "intake").status, 0);
  await rm(guard, { recursive: true });
  parse(run(local, owner.id, "intake"));
  assert.equal(spawnSync(process.execPath, [lockCli, "inspect"], { cwd: local, encoding: "utf8" }).status, 0);
});
