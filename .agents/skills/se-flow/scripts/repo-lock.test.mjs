import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const utility = fileURLToPath(new URL("./repo-lock.mjs", import.meta.url));

async function makeRepository(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "se-flow-lock-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", directory]);
  execFileSync("git", ["-C", directory, "config", "core.autocrlf", "false"]);
  execFileSync("git", ["-C", directory, "config", "user.name", "Lock Test"]);
  execFileSync("git", ["-C", directory, "config", "user.email", "lock-test@example.invalid"]);
  await writeFile(path.join(directory, "seed.txt"), "temporary test repository\n");
  execFileSync("git", ["-C", directory, "add", "seed.txt"]);
  execFileSync("git", ["-C", directory, "commit", "--quiet", "-m", "initial"]);
  return directory;
}

function run(cwd, args, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [utility, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function acquire(cwd, ticket, sessionId) {
  const result = await run(cwd, ["acquire", "--ticket", ticket, "--session-id", sessionId]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function lockPath(repository) {
  return path.join(repository, ".git", "se-flow.lock");
}

test("owner verifies and releases; a blocked session can then acquire", async (t) => {
  const repository = await makeRepository(t);
  const owner = await acquire(repository, "issue 41", "session-a");

  const blocked = await run(repository, ["acquire", "--ticket", "issue 42", "--session-id", "session-b"]);
  assert.equal(blocked.code, 10);
  assert.match(blocked.stderr, /Active ticket: issue 41/);
  assert.match(blocked.stderr, /Owner session ID: session-a/);
  assert.match(blocked.stderr, /Acquired at:/);
  assert.match(blocked.stderr, new RegExp(`Workspace: ${repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(blocked.stderr, /BLOCKED/);

  const verified = await run(repository, ["verify", "--token", owner.ownershipToken]);
  assert.equal(verified.code, 0, verified.stderr);
  assert.match(verified.stdout, /"verified": true/);

  const released = await run(repository, ["release", "--token", owner.ownershipToken]);
  assert.equal(released.code, 0, released.stderr);
  const secondOwner = await acquire(repository, "issue 42", "session-b");
  assert.equal(secondOwner.sessionId, "session-b");
  assert.equal((await run(repository, ["release", "--token", secondOwner.ownershipToken])).code, 0);
});

test("invalid ownership tokens cannot release a lock", async (t) => {
  const repository = await makeRepository(t);
  const owner = await acquire(repository, "local task", "session-a");

  const rejected = await run(repository, ["release", "--token", "not-the-owner-token"]);
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /Release refused/);
  assert.equal((await run(repository, ["verify", "--token", owner.ownershipToken])).code, 0);
});

test("simultaneous acquisition has exactly one winner", async (t) => {
  const repository = await makeRepository(t);
  const results = await Promise.all([
    run(repository, ["acquire", "--ticket", "task A", "--session-id", "session-a"]),
    run(repository, ["acquire", "--ticket", "task B", "--session-id", "session-b"]),
  ]);
  assert.equal(results.filter((result) => result.code === 0).length, 1);
  assert.equal(results.filter((result) => result.code === 10).length, 1);
});

test("a crashed controller leaves a recoverable lock and never triggers automatic stealing", async (t) => {
  const repository = await makeRepository(t);
  const owner = await acquire(repository, "issue 70", "crashed-session");
  // The acquire process has exited, as it does when its controlling Codex session later crashes.
  const blocked = await run(repository, ["acquire", "--ticket", "issue 71", "--session-id", "new-session"]);
  assert.equal(blocked.code, 10);
  assert.match(blocked.stderr, /Owner session ID: crashed-session/);

  const inspected = await run(repository, ["inspect"]);
  assert.equal(inspected.code, 0);
  assert.match(inspected.stdout, /"ticket": "issue 70"/);
  assert.match(inspected.stdout, /"state": "active"/);
  assert.ok(owner.ownershipToken);
});

test("worktrees share the canonical common-directory lock", async (t) => {
  const repository = await makeRepository(t);
  const worktree = path.join(path.dirname(repository), `${path.basename(repository)}-worktree`);
  t.after(() => rm(worktree, { recursive: true, force: true }));
  execFileSync("git", ["-C", repository, "worktree", "add", "--quiet", "-b", "secondary", worktree]);

  const owner = await acquire(repository, "issue 88", "main-session");
  const blocked = await run(worktree, ["acquire", "--ticket", "issue 89", "--session-id", "worktree-session"]);
  assert.equal(blocked.code, 10);
  assert.match(blocked.stderr, /Owner session ID: main-session/);
  assert.equal(await readFile(path.join(repository, ".git", "se-flow.lock", "owner.json"), "utf8").then((text) => JSON.parse(text).workspace), repository);

  assert.equal((await run(repository, ["release", "--token", owner.ownershipToken])).code, 0);
});

test("manual recovery requires owner identity and explicit confirmation, and leaves Git locks untouched", async (t) => {
  const repository = await makeRepository(t);
  await acquire(repository, "abandoned issue", "abandoned-session");
  const lockDirectory = lockPath(repository);
  const sentinel = path.join(repository, ".git", "index.lock");
  await writeFile(sentinel, "must remain untouched");
  const metadata = JSON.parse(await readFile(path.join(lockDirectory, "owner.json"), "utf8"));

  const wrongOwner = await run(repository, ["force-unlock", "--owner", "other-session", "--confirm", "FORCE UNLOCK other-session"]);
  assert.notEqual(wrongOwner.code, 0);
  const wrongConfirmation = await run(repository, ["force-unlock", "--owner", metadata.sessionId, "--confirm", "yes"]);
  assert.notEqual(wrongConfirmation.code, 0);
  assert.match(wrongConfirmation.stderr, /requires --confirm/);
  assert.equal((await run(repository, ["inspect"])).code, 0);

  const recovered = await run(repository, [
    "force-unlock", "--owner", metadata.sessionId,
    "--confirm", `FORCE UNLOCK ${metadata.sessionId}`,
  ]);
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.equal(await readFile(sentinel, "utf8"), "must remain untouched");
  assert.match(recovered.stdout, /No other Git lock files were touched/);
});

test("incomplete acquisition metadata remains blocked and requires explicit recovery", async (t) => {
  const repository = await makeRepository(t);
  await mkdir(lockPath(repository));
  await writeFile(path.join(lockPath(repository), "owner.json"), "{partial");

  const blocked = await run(repository, ["acquire", "--ticket", "issue 90", "--session-id", "session-b"]);
  assert.equal(blocked.code, 10);
  assert.match(blocked.stderr, /metadata is missing or incomplete/);
  const inspected = await run(repository, ["inspect"]);
  assert.match(inspected.stdout, /manual inspection/);
  assert.match(inspected.stdout, /force-unlock --incomplete/);

  const refused = await run(repository, [
    "force-unlock", "--incomplete", "yes", "--confirm", "wrong confirmation",
  ]);
  assert.notEqual(refused.code, 0);
  const recovered = await run(repository, [
    "force-unlock", "--incomplete", "yes", "--confirm", "FORCE UNLOCK INCOMPLETE",
  ]);
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.match(recovered.stdout, /No other Git lock files were touched/);
});
