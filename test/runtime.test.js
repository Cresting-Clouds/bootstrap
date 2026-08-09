"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  GRANT_SCHEMA,
  isSafeArchivePath,
  publishEncryptedGrant,
  requireArchiveUrl,
  validateRuntimeResponse,
} = require("../src/runtime");

test("accepts only GitHub HTTPS archive URLs", () => {
  assert.equal(requireArchiveUrl("https://codeload.github.com/org/repo/tar.gz/abc"), "https://codeload.github.com/org/repo/tar.gz/abc");
  assert.throws(() => requireArchiveUrl("https://attacker.invalid/runtime.tar.gz"), /invalid_runtime_archive_url/);
  assert.throws(() => requireArchiveUrl("http://codeload.github.com/runtime.tar.gz"), /invalid_runtime_archive_url/);
});

test("rejects traversal archive paths", () => {
  assert.equal(isSafeArchivePath("owner-repo/run.js"), true);
  assert.equal(isSafeArchivePath("../outside"), false);
  assert.equal(isSafeArchivePath("/absolute"), false);
  assert.equal(isSafeArchivePath("owner\\outside"), false);
});

test("validates a repository-bound runtime response", () => {
  const runtime = validateRuntimeResponse({
    schema: "cresting-clouds-runtime/v1",
    repository: "customer/repository",
    heartbeat_id: "heartbeat-123",
    customer_token: "temporary-customer-token-value",
    archive_url: "https://codeload.github.com/org/repo/tar.gz/abc",
    zephyr_sha: "a".repeat(40),
  }, "customer/repository");
  assert.equal(runtime.heartbeatId, "heartbeat-123");
  assert.throws(() => validateRuntimeResponse({
    schema: "cresting-clouds-runtime/v1",
    repository: "other/repository",
  }, "customer/repository"), /runtime_repository_mismatch/);
});

test("publishes only the signed encrypted reference and removes its local file", async () => {
  const runnerTemp = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-test-"));
  let captured;
  const artifactClient = {
    async uploadArtifact(name, files, root, options) {
      captured = {
        name,
        root,
        options,
        document: JSON.parse(await fs.readFile(files[0], "utf8")),
      };
    },
  };
  try {
    await publishEncryptedGrant({
      reference: "signed.encrypted.reference",
      payload: {
        artifact_name: "cresting-clouds-vscode-auth-nonce123",
        encrypted_grant: { ciphertext: "not-written-separately" },
      },
      artifactClient,
      runnerTemp,
    });
    assert.equal(captured.document.schema, GRANT_SCHEMA);
    assert.deepEqual(Object.keys(captured.document).sort(), ["reference", "schema"]);
    assert.equal(captured.options.retentionDays, 1);
    await assert.rejects(fs.access(captured.root));
  } finally {
    await fs.rm(runnerTemp, { recursive: true, force: true });
  }
});

