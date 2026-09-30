// Build-kommando på Vercel.
// Med CONVEX_DEPLOY_KEY deployes Convex-funktionerne først, og
// NEXT_PUBLIC_CONVEX_URL sættes automatisk for Next.js-buildet.
// Uden nøglen bygges kun Next.js, og appen bruger REST-fallbacken (/api/*).

import { spawnSync } from "node:child_process";

const run = (cmd) => {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (process.env.CONVEX_DEPLOY_KEY) {
  run('npx convex deploy --cmd "npx next build"');
} else {
  console.log("CONVEX_DEPLOY_KEY er ikke sat: bygger uden Convex (REST-fallback).");
  run("npx next build");
}
