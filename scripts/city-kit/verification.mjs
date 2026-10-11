import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const manifest = JSON.parse(fs.readFileSync(new URL("./verification-manifest.json", import.meta.url), "utf8"));
const synthetic = ["verify-city-block-surface", "verify-city-shore-plot-access", "verify-city-joint-frontage", "verify-city-road-blocks", "verify-city-road-admission", "verify-city-world", "verify-city-access-capabilities", "verify-city-endpoint-routing", "verify-city-road-faces", "verify-city-radius", "verify-city-network-patch", "verify-city-connect", "verify-city-footprint-geoms", "verify-city-loop", "verify-city-landing"];
const groups = {
  network: [...synthetic, "verify-city-causeway-primary", "verify-city-road-report", "verify-city-intent", "verify-city-solve", "verify-react-city-layout", "verify-city-cross-engine"],
  sites: ["verify-city-shore-plot-access", "verify-city-shore-plot-access-named", "verify-city-joint-frontage", "verify-city-required-placement", "verify-city-causeway-primary", "verify-city-world", "verify-city-access-capabilities", "verify-city-footprint-geoms", "verify-city-sitespec", "verify-city-models", "verify-city-physical", "verify-react-city-layout", "verify-city-intent"],
  planning: ["verify-city-block-surface", "verify-city-shore-plot-access", "verify-city-shore-plot-access-named", "verify-city-joint-frontage", "verify-city-required-placement", "verify-city-road-blocks", "verify-city-road-admission", "verify-city-causeway-primary", "verify-city-world", "verify-city-road-faces", "verify-city-endpoint-routing", "verify-city-radius", "verify-city-road-report", "verify-city-planning", "verify-city-constraints", "verify-city-baseline", "verify-city-survey", "verify-city-cross-engine"],
  display: ["verify-city-block-surface", "verify-city-road-report", "verify-city-active", "verify-react-city-layout", "verify-city-culdesac-bulbs", "verify-city-scene-baseline", "verify-react-city-seaside", "seaside-tier10"],
  game: ["verify-city-game-session", "verify-city-game-controller", "verify-city-game-world", "verify-city-game-flight", "verify-city-game-race", "verify-city-game-profile"],
};
const newGeometryStages = ["verify-city-layout-envelopes", "verify-city-parcel-frontage", "verify-city-block-placement", "verify-city-block-lot-candidates", "verify-city-villa-physical", "verify-city-model-ground"];
synthetic.push(...newGeometryStages);
synthetic.push("verify-city-layout-capacity");
synthetic.push("verify-city-model-envelope");
groups.planning.push("verify-city-model-envelope");
groups.sites.push("verify-city-model-envelope");
groups.planning.push("verify-city-villa-placement");
groups.sites.push("verify-city-villa-placement");
groups.planning.push("verify-city-layout-capacity");
groups.display.push("verify-city-layout-capacity");
groups.planning.push(...newGeometryStages, "verify-city-road-derived-plan");
groups.sites.push(...newGeometryStages);
groups.display.push("verify-city-layout-envelopes", "verify-city-layout-placement", "verify-city-parcel-frontage", "verify-city-block-placement", "verify-city-block-lot-candidates");
groups.planning.push("verify-city-layout-placement");
groups.sites.push("verify-city-layout-placement");
export function selectStages(mode, group) {
  if (mode === "full") return manifest;
  if (mode === "fast") return manifest.filter((s) => synthetic.includes(s.id));
  if (mode === "module" && groups[group]) return manifest.filter((s) => groups[group].includes(s.id));
  throw new Error("Usage: verify-city-suite.mjs full|fast|module <network|sites|planning|display|game> [--no-cache] [--report <path>]");
}
export const typecheck = {
  id: "typecheck", cwd: fileURLToPath(new URL("../../apps/agent-city/ui/", import.meta.url)),
  command: "npm", args: ["run", "typecheck"],
};
export const build = { ...typecheck, id: "build", args: ["run", "build"] };
