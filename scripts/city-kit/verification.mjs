import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const manifest = JSON.parse(fs.readFileSync(new URL("./verification-manifest.json", import.meta.url), "utf8"));
const synthetic = ["verify-city-network-patch", "verify-city-connect", "verify-city-footprint-geoms", "verify-city-loop", "verify-city-landing"];
const groups = {
  network: [...synthetic, "verify-city-intent", "verify-city-solve", "verify-react-city-layout", "verify-city-cross-engine"],
  sites: ["verify-city-footprint-geoms", "verify-city-sitespec", "verify-city-models", "verify-react-city-layout", "verify-city-intent"],
  planning: ["verify-city-planning", "verify-city-constraints", "verify-city-baseline", "verify-city-survey", "verify-city-cross-engine"],
  display: ["verify-city-active", "verify-react-city-layout", "verify-city-culdesac-bulbs", "verify-city-scene-baseline", "verify-react-city-seaside", "seaside-tier10"],
};
export function selectStages(mode, group) {
  if (mode === "full") return manifest;
  if (mode === "fast") return manifest.filter((s) => synthetic.includes(s.id));
  if (mode === "module" && groups[group]) return manifest.filter((s) => groups[group].includes(s.id));
  throw new Error("Usage: verify-city-suite.mjs full|fast|module <network|sites|planning|display> [--no-cache] [--report <path>]");
}
export const typecheck = {
  id: "typecheck", cwd: fileURLToPath(new URL("../../apps/agent-city/ui/", import.meta.url)),
  command: "npm", args: ["run", "typecheck"],
};
export const build = { ...typecheck, id: "build", args: ["run", "build"] };
