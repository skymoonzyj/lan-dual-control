import { pathToFileURL } from "node:url";

import { createWindowsHostServer } from "./src/windows-host-service.mjs";

function readConfig() {
  const portArg = Number.parseInt(process.argv[2] ?? "", 10);
  const hostArg = process.argv[3];

  return {
    host: hostArg || process.env.LAN_DUAL_HOST || "0.0.0.0",
    port: Number.isFinite(portArg)
      ? portArg
      : Number.parseInt(process.env.LAN_DUAL_PORT || "43770", 10),
    password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  };
}

async function main() {
  const service = createWindowsHostServer(readConfig());
  await service.listen();

  const shutdown = async () => {
    await service.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { createWindowsHostServer };
