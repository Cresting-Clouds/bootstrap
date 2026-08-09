import os from "node:os";
import * as core from "@actions/core";
import referenceModule from "./reference.js";
import runtimeModule from "./runtime.js";

const { verifyReference } = referenceModule;
const { runRuntime, stageEncryptedGrant } = runtimeModule;

async function main() {
  const reference = core.getInput("ref", { required: true });
  const { payload } = verifyReference(reference);
  core.setOutput("purpose", payload.purpose);

  if (payload.purpose === "vscode-auth") {
    const stagedGrant = await stageEncryptedGrant({
      reference,
      payload,
      runnerTemp: process.env.RUNNER_TEMP || os.tmpdir(),
    });
    core.setOutput("artifact-name", stagedGrant.artifactName);
    core.setOutput("artifact-path", stagedGrant.file);
    core.setOutput("grant-root", stagedGrant.root);
    return;
  }

  await runRuntime({ reference, payload, core });
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
