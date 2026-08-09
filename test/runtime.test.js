"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  GRANT_SCHEMA,
  cloneCustomer,
  isSafeArchivePath,
  requireArchiveUrl,
  stageEncryptedGrant,
  validateRuntimeResponse,
} = require("../src/runtime");

test("clones from the surviving workspace parent after deleting the checkout", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-clone-test-"));
  const workspace = path.join(root, "customer", "repository");
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, "stale.txt"), "stale\n");

  try {
    await cloneCustomer({
      repository: "customer/repository",
      customerToken: "temporary-customer-token-value",
    }, workspace, async (command, args, options) => {
      assert.equal(command, "git");
      assert.deepEqual(args, [
        "clone",
        "--no-tags",
        "https://github.com/customer/repository.git",
        workspace,
      ]);
      assert.equal(options.cwd, path.dirname(workspace));
      await fs.access(options.cwd);
      await assert.rejects(fs.access(workspace), { code: "ENOENT" });
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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

test("stages only the signed encrypted reference for the workflow uploader", async () => {
  const runnerTemp = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-test-"));
  try {
    const staged = await stageEncryptedGrant({
      reference: "signed.encrypted.reference",
      payload: {
        artifact_name: "cresting-clouds-vscode-auth-nonce123",
        encrypted_grant: { ciphertext: "not-written-separately" },
      },
      runnerTemp,
    });
    const document = JSON.parse(await fs.readFile(staged.file, "utf8"));
    assert.equal(staged.artifactName, "cresting-clouds-vscode-auth-nonce123");
    assert.equal(path.dirname(staged.file), staged.root);
    assert.equal(path.dirname(staged.root), runnerTemp);
    assert.match(path.basename(staged.root), /^cresting-clouds-grant-/);
    assert.equal(document.schema, GRANT_SCHEMA);
    assert.deepEqual(Object.keys(document).sort(), ["reference", "schema"]);
  } finally {
    await fs.rm(runnerTemp, { recursive: true, force: true });
  }
});

test("delegates grant upload to GitHub's pinned action and always cleans the staged file", async () => {
  const action = await fs.readFile(path.join(__dirname, "..", "action.yml"), "utf8");
  const source = await fs.readFile(path.join(__dirname, "..", "src", "index.js"), "utf8");
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));

  assert.match(action, /id: bootstrap/);
  assert.match(action, /if: \$\{\{ steps\.bootstrap\.outputs\.purpose == 'vscode-auth' \}\}/);
  assert.match(action, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(action, /retention-days: 1/);
  assert.match(action, /if-no-files-found: error/);
  assert.match(action, /if: \$\{\{ always\(\) && steps\.bootstrap\.outputs\.grant-root != '' \}\}/);
  assert.match(action, /"\$RUNNER_TEMP_ROOT"\/cresting-clouds-grant-\*/);
  assert.doesNotMatch(source, /DefaultArtifactClient|@actions\/artifact/);
  assert.equal(packageJson.dependencies["@actions/artifact"], undefined);
});
