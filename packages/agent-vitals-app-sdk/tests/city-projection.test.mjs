import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
import { repo, sdk } from "../../../scripts/app-contract-support.mjs";
const {build}=createRequire(`${repo}/apps/desktop/ui-dev/package.json`)("esbuild");
const compiled=(await build({entryPoints:[`${sdk}/src/city-ui-projection.ts`],bundle:true,write:false,platform:"node",format:"cjs",logLevel:"silent"})).outputFiles[0].text;
const module={exports:{}}; vm.runInNewContext(compiled,{module,exports:module.exports});
const {validateCityProjectionV2,validateCityProjectionV3}=module.exports;
const session={id:`sr_${"a".repeat(32)}`,asset_ref:`ca_${"b".repeat(32)}`,layout_order:1,harness:"harness:fixture",
  title:"Example",title_source:"plugin_title_v2",first_event_at:"2026-10-01T00:00:00Z",last_event_at:"2026-10-02T00:00:00Z",
  tokens:{input:3,uncached_input:1,cache_read:1,cache_write:1,output:2,total:5}};
const response={protocol:"city:v3",source:"local",query_semantics:"city-window-v3.1",data_revision:1,
  snapshot:`sr_${"c".repeat(32)}`,context:`sr_${"d".repeat(32)}`,window:{days:7,from_ms:1,to_ms:604800001,timezone:"UTC",boundary:"half_open",calendar_mode:"rolling"},
  page:{sessions:[session],next_cursor:null,coverage:{matched:1,returned:1,offset:0}}};
test("City v3 validates safe integers, tokens, page counts, source tokens and stable asset handles",()=>{
  assert.equal(validateCityProjectionV3(response),response);
  for (const change of [v=>v.page.sessions[0].tokens.total=99,v=>v.page.sessions[0].tokens.input=Number.MAX_SAFE_INTEGER+1,
    v=>v.page.sessions[0].tokens.cache_read=5,v=>v.page.coverage.returned=2,v=>v.page.sessions[0].title_source="",
    v=>v.page.sessions[0].asset_ref="/private/path",v=>v.window.boundary="closed",v=>v.page.sessions[0].first_event_at="bad"]) {
    const changed=structuredClone(response); change(changed); assert.throws(()=>validateCityProjectionV3(changed));
  }
});
test("v2 remains compatible while missing source is null and unknown sources are controlled tokens",()=>{
  const v2={protocol:"city:v2",harnesses:[],findings:[],sessions:[{...session,title_source:null}],coverage:{total:1,returned:1}};
  assert.equal(validateCityProjectionV2(v2),v2);
  v2.sessions[0].tokens.total=NaN; assert.throws(()=>validateCityProjectionV2(v2));
});
