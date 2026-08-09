import os from "node:os";
import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";
import referenceModule from "./reference.js";
import runtimeModule from "./runtime.js";

const { verifyReference } = referenceModule;
const { publishEncryptedGrant, runRuntime } = runtimeModule;

async function main() {
  const reference = core.getInput("ref", { required: true });
  const { payload } = verifyReference(reference);
  core.setOutput("purpose", payload.purpose);

  if (payload.purpose === "vscode-auth") {
    await publishEncryptedGrant({
      reference,
      payload,
      artifactClient: new DefaultArtifactClient(),
      runnerTemp: process.env.RUNNER_TEMP || os.tmpdir(),
    });
    return;
  }

  await runRuntime({ reference, payload, core });
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
