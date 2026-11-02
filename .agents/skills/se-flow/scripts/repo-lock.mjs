#!/usr/bin/env node

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";

const LOCK_NAME = "se-flow.lock";
const OWNER_FILE = "owner.json";
const MUTATION_GUARD_NAME = "se-flow.lock.mutation-guard";

function parseArgs(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key.startsWith("--") || i + 1 >= rest.length || rest[i + 1].startsWith("--")) {
      throw new Error(`Expected ${key} to be followed by a value.`);
    }
    options[key.slice(2)] = rest[i + 1];
    i += 1;
  }
  return { command, options };
}

async function findRepository(startDirectory) {
  let directory = await realpath(startDirectory);
  while (true) {
    const marker = path.join(directory, ".git");
    try {
      const markerStat = await stat(marker);
      let gitDirectory;
      if (markerStat.isDirectory()) {
        gitDirectory = await realpath(marker);
      } else {
        const contents = await readFile(marker, "utf8");
        const match = contents.match(/^gitdir:\s*(.+)\s*$/im);
        if (!match) throw new Error(`Invalid Git worktree pointer: ${marker}`);
        gitDirectory = await realpath(path.resolve(directory, match[1].trim()));
      }

      let commonDirectory = gitDirectory;
      try {
        const commonPointer = (await readFile(path.join(gitDirectory, "commondir"), "utf8")).trim();
        if (commonPointer) commonDirectory = await realpath(path.resolve(gitDirectory, commonPointer));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      return {
        workspace: directory,
        commonDirectory,
        lockDirectory: path.join(commonDirectory, LOCK_NAME),
        mutationGuardDirectory: path.join(commonDirectory, MUTATION_GUARD_NAME),
      };
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }

    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`No Git repository found from ${startDirectory}.`);
}

async function readLock(lockDirectory) {
  try {
    const directoryStat = await lstat(lockDirectory);
    if (!directoryStat.isDirectory()) return { exists: true, metadata: null, problem: "lock path is not a directory" };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }

  try {
    const text = await readFile(path.join(lockDirectory, OWNER_FILE), "utf8");
    const metadata = JSON.parse(text);
    if (!isValidMetadata(metadata)) return { exists: true, metadata: null, problem: "owner metadata is incomplete or invalid", fingerprint: fingerprint(text) };
    return { exists: true, metadata };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      let text = "<missing>";
      try {
        text = await readFile(path.join(lockDirectory, OWNER_FILE), "utf8");
      } catch (readError) {
        if (readError.code !== "ENOENT") throw readError;
      }
      return { exists: true, metadata: null, problem: "owner metadata is missing or incomplete", fingerprint: fingerprint(text) };
    }
    throw error;
  }
}

async function readMutationGuard(guardDirectory) {
  try {
    const guardStat = await lstat(guardDirectory);
    if (!guardStat.isDirectory()) return { exists: true, metadata: null, problem: "mutation guard path is not a directory" };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }

  try {
    const text = await readFile(path.join(guardDirectory, OWNER_FILE), "utf8");
    const metadata = JSON.parse(text);
    if (!isValidGuardMetadata(metadata)) {
      return { exists: true, metadata: null, problem: "mutation guard metadata is incomplete or invalid", fingerprint: fingerprint(text) };
    }
    return { exists: true, metadata };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      let text = "<missing>";
      try {
        text = await readFile(path.join(guardDirectory, OWNER_FILE), "utf8");
      } catch (readError) {
        if (readError.code !== "ENOENT") throw readError;
      }
      return { exists: true, metadata: null, problem: "mutation guard metadata is missing or incomplete", fingerprint: fingerprint(text) };
    }
    throw error;
  }
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isValidMetadata(metadata) {
  return metadata && metadata.version === 1 && metadata.state === "active"
    && ["ticket", "workspace", "sessionId", "acquiredAt", "tokenHash"].every(
      (key) => typeof metadata[key] === "string" && metadata[key].length > 0,
    );
}

function isValidGuardMetadata(metadata) {
  return metadata && metadata.version === 1 && metadata.state === "mutating"
    && ["operation", "ticket", "workspace", "sessionId", "acquiredAt", "tokenHash"].every(
      (key) => typeof metadata[key] === "string" && metadata[key].length > 0,
    );
}

function publicMetadata(metadata) {
  const { tokenHash, ...visible } = metadata;
  return visible;
}

function displayOwner(metadata) {
  return [
    "BLOCKED: another session owns the Speakflow repository lock.",
    `Active ticket: ${metadata.ticket}`,
    `Owner session ID: ${metadata.sessionId}`,
    `Acquired at: ${metadata.acquiredAt}`,
    `Workspace: ${metadata.workspace}`,
    "Do not run Git operations or inspect/edit repository files. Retry only after the owner releases the lock.",
  ].join("\n");
}

function displayMutationGuard(metadata) {
  return [
    "BLOCKED: another process owns the Speakflow lock mutation guard.",
    `Operation: ${metadata.operation}`,
    `Active ticket: ${metadata.ticket}`,
    `Guard owner ID: ${metadata.sessionId}`,
    `Acquired at: ${metadata.acquiredAt}`,
    `Workspace: ${metadata.workspace}`,
    "Do not retry automatically or remove an ambiguous guard.",
  ].join("\n");
}

function tokenMatches(token, tokenHash) {
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function acquireMutationGuard(repository, operation, ticket, sessionId) {
  const operationId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const metadata = {
    version: 1,
    operation,
    ticket: ticket || `${operation} repository lock`,
    workspace: repository.workspace,
    sessionId: sessionId || `mutation-${operationId}`,
    acquiredAt: new Date().toISOString(),
    state: "mutating",
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };

  try {
    await mkdir(repository.mutationGuardDirectory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const current = await readMutationGuard(repository.mutationGuardDirectory);
    if (current.metadata) throw new Error(displayMutationGuard(current.metadata));
    throw new Error(`BLOCKED: a mutation guard exists but ${current.problem || "its owner cannot be read"}. Inspect it; never clean it automatically.`);
  }

  await testCheckpoint("after-guard-directory");
  try {
    await writeFile(path.join(repository.mutationGuardDirectory, OWNER_FILE), `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    throw new Error(`Mutation guard was created but its metadata could not be written (${error.message}). Guard preserved; inspect and recover manually only after confirming no mutation is active.`);
  }
  await testCheckpoint("after-guard-ready");
  return { token, metadata };
}

async function releaseMutationGuard(repository, guard) {
  const current = await readMutationGuard(repository.mutationGuardDirectory);
  if (!current.exists || !current.metadata || !tokenMatches(guard.token, current.metadata.tokenHash)) {
    throw new Error("Mutation guard ownership verification failed; refusing to remove it.");
  }
  const entries = await readdir(repository.mutationGuardDirectory);
  if (entries.length !== 1 || entries[0] !== OWNER_FILE) {
    throw new Error("Mutation guard contains unexpected files; refusing to remove it.");
  }
  await unlink(path.join(repository.mutationGuardDirectory, OWNER_FILE));
  await rmdir(repository.mutationGuardDirectory);
}

async function withMutationGuard(repository, operation, ticket, sessionId, action) {
  const guard = await acquireMutationGuard(repository, operation, ticket, sessionId);
  let result;
  let actionError;
  try {
    result = await action();
  } catch (error) {
    actionError = error;
  }

  try {
    await releaseMutationGuard(repository, guard);
  } catch (releaseError) {
    if (actionError) {
      throw new AggregateError([actionError, releaseError], `Lock operation failed and its mutation guard could not be released: ${releaseError.message}`);
    }
    throw releaseError;
  }
  if (actionError) throw actionError;
  return result;
}

async function testCheckpoint(name) {
  if (process.env.NODE_ENV !== "test" || process.env.SE_FLOW_LOCK_TEST_PAUSE_AT !== name) return;
  stdout.write(`TEST_PAUSED ${name}\n`);
  const continueFile = process.env.SE_FLOW_LOCK_TEST_CONTINUE_FILE;
  if (!continueFile) await new Promise(() => {});
  while (true) {
    try {
      await access(continueFile);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

async function acquire(repository, options) {
  if (!options.ticket) throw new Error("acquire requires --ticket.");
  const sessionId = options["session-id"] || randomUUID();
  const token = randomBytes(32).toString("base64url");
  const metadata = {
    version: 1,
    ticket: options.ticket,
    workspace: repository.workspace,
    sessionId,
    acquiredAt: new Date().toISOString(),
    state: "active",
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };

  await withMutationGuard(repository, "acquire", options.ticket, sessionId, async () => {
    const current = await readLock(repository.lockDirectory);
    if (current.exists) {
      if (current.metadata) throw new Error(displayOwner(current.metadata));
      throw new Error(`BLOCKED: a lock exists but ${current.problem || "its owner cannot be read"}. Do not proceed. Inspect it and use confirmed manual recovery only if abandoned.`);
    }

    try {
      await mkdir(repository.lockDirectory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const latest = await readLock(repository.lockDirectory);
      if (latest.metadata) throw new Error(displayOwner(latest.metadata));
      throw new Error(`BLOCKED: a lock exists but ${latest.problem || "its owner cannot be read"}. Do not proceed.`);
    }

    await testCheckpoint("after-lock-directory");
    try {
      await writeFile(path.join(repository.lockDirectory, OWNER_FILE), `${JSON.stringify(metadata, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      throw new Error(`Lock directory was created but owner metadata could not be written (${error.message}). Lock preserved; inspect and recover manually if abandoned.`);
    }
  });

  stdout.write(`${JSON.stringify({ acquired: true, lockDirectory: repository.lockDirectory, ...publicMetadata(metadata), ownershipToken: token }, null, 2)}\n`);
}

async function verify(repository, token) {
  const current = await withMutationGuard(repository, "verify", "verify repository lock", undefined, async () => {
    const lock = await readLock(repository.lockDirectory);
    if (!lock.exists || !lock.metadata || !tokenMatches(token, lock.metadata.tokenHash)) {
      throw new Error("Repository lock ownership verification failed. Stop immediately; do not continue the workflow.");
    }
    return lock;
  });
  stdout.write(`${JSON.stringify({ verified: true, ...publicMetadata(current.metadata) }, null, 2)}\n`);
}

async function release(repository, token) {
  const current = await withMutationGuard(repository, "release", "release repository lock", undefined, async () => {
    const lock = await readLock(repository.lockDirectory);
    if (!lock.exists || !lock.metadata || !tokenMatches(token, lock.metadata.tokenHash)) {
      throw new Error("Release refused: the supplied ownership token does not own this repository lock.");
    }
    await removeOwnedLock(repository.lockDirectory, lock);
    return lock;
  });
  stdout.write(`Released Speakflow lock owned by ${current.metadata.sessionId}.\n`);
}

async function removeOwnedLock(lockDirectory, expected) {
  if (expected) {
    const latest = await readLock(lockDirectory);
    const unchanged = expected.metadata
      ? latest.exists && sameOwner(expected.metadata, latest.metadata)
      : latest.exists && !latest.metadata && latest.fingerprint === expected.fingerprint;
    if (!unchanged) throw new Error("Lock changed before removal; refusing to release or recover it.");
  }
  const entries = await readdir(lockDirectory);
  if (entries.some((entry) => entry !== OWNER_FILE)) {
    throw new Error("Lock directory contains unexpected files; refusing to remove anything except an empty owned lock.");
  }
  if (entries.includes(OWNER_FILE)) await unlink(path.join(lockDirectory, OWNER_FILE));
  await rmdir(lockDirectory);
  await testCheckpoint("after-lock-removed");
}

async function inspect(repository) {
  const guard = await readMutationGuard(repository.mutationGuardDirectory);
  const current = await readLock(repository.lockDirectory);
  if (guard.exists) {
    if (guard.metadata) {
      stdout.write(`Mutation guard requires inspection:\n${displayMutationGuard(guard.metadata)}\nGuard directory: ${repository.mutationGuardDirectory}\n`);
    } else {
      stdout.write(`Mutation guard requires manual inspection: ${guard.problem}.\nGuard directory: ${repository.mutationGuardDirectory}\nNever remove it automatically.\n`);
    }
  }
  if (!current.exists) {
    stdout.write(`No Speakflow repository lock at ${repository.lockDirectory}.\n`);
    return;
  }
  if (current.metadata) {
    stdout.write(`${JSON.stringify({ lockDirectory: repository.lockDirectory, ...publicMetadata(current.metadata) }, null, 2)}\n`);
    return;
  }
  stdout.write(`Lock requires manual inspection: ${current.problem}.\nLock directory: ${repository.lockDirectory}\nUse force-unlock --incomplete only after confirming no owner session is active.\n`);
}

async function forceUnlock(repository, options) {
  const current = await withMutationGuard(repository, "force-unlock", "manual lock recovery", options.owner, async () => {
    const lock = await readLock(repository.lockDirectory);
    if (!lock.exists) throw new Error("No Speakflow lock exists to recover.");

    const incomplete = !lock.metadata;
    if (incomplete && options.incomplete !== "yes") {
      throw new Error("Lock metadata is incomplete. Use --incomplete yes only after inspecting the lock and confirming no owner session is active.");
    }
    if (!incomplete && options.owner !== lock.metadata.sessionId) {
      throw new Error(`Owner ID mismatch. Current owner is ${lock.metadata.sessionId}; pass it with --owner after confirming that session is stopped.`);
    }

    if (incomplete) {
      stdout.write(`Incomplete Speakflow lock at ${repository.lockDirectory}. Confirm the owning session is stopped.\n`);
    } else {
      stdout.write(`${displayOwner(lock.metadata)}\nConfirm the owner session is stopped before recovery.\n`);
    }
    const confirmation = incomplete ? "FORCE UNLOCK INCOMPLETE" : `FORCE UNLOCK ${lock.metadata.sessionId}`;
    if (options.confirm !== confirmation) {
      throw new Error(`Force unlock requires --confirm "${confirmation}" after the user confirms that the owner is stopped.`);
    }

    const latest = await readLock(repository.lockDirectory);
    if (!latest.exists || (incomplete
      ? latest.metadata || latest.fingerprint !== lock.fingerprint
      : !sameOwner(lock.metadata, latest.metadata))) {
      throw new Error("Lock changed during recovery; refusing to remove it.");
    }
    await removeOwnedLock(repository.lockDirectory, lock);
    return lock;
  });
  stdout.write("Removed the confirmed abandoned Speakflow lock. No other Git lock files were touched.\n");
}

function sameOwner(first, second) {
  return second && first.sessionId === second.sessionId && first.acquiredAt === second.acquiredAt
    && first.tokenHash === second.tokenHash && first.ticket === second.ticket && first.workspace === second.workspace;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!["acquire", "verify", "release", "inspect", "force-unlock"].includes(command)) {
    throw new Error("Usage: repo-lock.mjs <acquire|verify|release|inspect|force-unlock> [--option value]");
  }

  const repository = await findRepository(process.cwd());
  if (command === "acquire") return acquire(repository, options);
  if (command === "inspect") return inspect(repository);
  if (command === "verify") return verify(repository, options.token);
  if (command === "release") return release(repository, options.token);
  return forceUnlock(repository, options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = error.message.startsWith("BLOCKED:") ? 10 : 1;
});
