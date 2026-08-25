// Re-export from the wasm files co-located at the dsh-client root.
// This shim lives in src/ so tsup can resolve it; the actual .wasm and .js
// glue live at the package root (they are build artifacts, not in src/).
export { initSync, audit_events, token_by_model, request_metrics, context_composition, compaction_events, subagent_spawns, structural_waste, skill_audit, skill_audit_enriched, duration_audit } from '../skill_vitals_wasm.js'
