/** Seeded, data-independent geography and municipal land reservations. */
import { hashSeed } from "../cityModel";
import { fbm, smoothstep } from "./cityNoise";
import type { CityBlock, CityLayout, Parcel, PublicSite, RoadEdge, RoadNode, TerrainField, Vec2, Zone } from "./cityLayout";

export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

export function polygonDistance(p: Vec2, polygon: Vec2[]): number {
  let inside = false; let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    distance = Math.min(distance, segmentDistance(p, a, b));
  }
  return inside ? distance : -distance;
}

export const roadNodeId = (p: Vec2): string => `${p.x}:${p.z}`;

export function createCityPlan(seed: number) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);
  const phase = random("river") * 3;
  const riverX = (z: number) => 37 * Math.sin(z * 0.006 + phase) + 18 * Math.sin(z * 0.014);
  const riverWidth = (z: number) => 16 + 4 * Math.cos(z * 0.012) + smoothstep(160, 440, z) * 36;
  const baseCoast = [[-610,-240],[-580,-440],[-350,-530],[-120,-575],[160,-520],[450,-430],[585,-240],[610,-60],[535,70],[510,210],[425,280],[405,400],[300,425],[205,375],[170,285],[70,235],[0,310],[-60,440],[-190,470],[-290,390],[-340,250],[-470,205],[-570,80],[-630,-80]];
  const coast = baseCoast.map(([x,z], i) => ({ x: x + (random(`cx${i}`) - 0.5) * 38, z: z + (random(`cz${i}`) - 0.5) * 36 }));
  const river = Array.from({ length: 101 }, (_, i) => { const z = -650 + i * 11; return { x: riverX(z), z }; });
  const landClearance = (x: number, z: number) => Math.min(polygonDistance({ x, z }, coast), Math.abs(x - riverX(z)) - riverWidth(z));
  const height = (x: number, z: number) => {
    const inland = landClearance(x, z);
    if (inland < 0) return -0.65 - Math.min(5, -inland * 0.25);
    const hills = smoothstep(-310, -495, z) * (30 + 65 * fbm(x * 0.012, z * 0.013, seed, 4));
    return smoothstep(0, 10, inland) * (1.2 + hills);
  };
  const terrain: TerrainField = {
    height, slope: (x,z) => Math.hypot(height(x+1,z)-height(x-1,z),height(x,z+1)-height(x,z-1))/2,
    buildable: (x,z) => landClearance(x,z) > 12 && z > -308,
    center: { x: 0, z: 0 }, radius: 750, coastRadius: () => 650, hasRiver: true,
  };
  // These destinations reserve land before session parcels are generated.
  const publicSites: PublicSite[] = [
    { id: "civic-square", kind: "civic", x: -170, z: -70, radius: 44, yaw: -0.15 },
    { id: "central-station", kind: "station", x: 235, z: -220, radius: 46, yaw: 0.12 },
    { id: "riverside-park", kind: "park", x: -105, z: 85, radius: 47, yaw: 0 },
    { id: "east-stadium", kind: "stadium", x: 370, z: 70, radius: 49, yaw: 0.2 },
    { id: "observation-tower", kind: "tower", x: 115, z: -120, radius: 26, yaw: 0 },
    { id: "working-harbor", kind: "harbor", x: -225, z: 365, radius: 37, yaw: -0.25 },
  ];
  const xs = new Map<number, number>([[0,-48],[1,48]]);
  for (let i = 1; i <= 12; i += 1) {
    xs.set(-i, xs.get(1-i)! - (43 + random(`west${i}`)*16));
    xs.set(i+1, xs.get(i)! + (49 + random(`east${i}`)*19));
  }
  const zs = new Map<number, number>([[0,-30]]);
  for (let i = 1; i <= 10; i += 1) {
    zs.set(-i, zs.get(1-i)! - (34 + random(`north${i}`)*17));
    zs.set(i, zs.get(i-1)! + (35 + random(`south${i}`)*20));
  }
  const warp = (x: number, z: number): Vec2 => {
    const wz = z + Math.sin(x * 0.006 + phase) * 21 + (x < 0 ? x * 0.14 : -x * 0.07);
    return { x: x + riverX(wz), z: wz };
  };
  const blocks: CityBlock[] = [];
  const nodes = new Map<string, RoadNode>(); const edges = new Map<string, RoadEdge>();
  const addEdge = (a: Vec2, b: Vec2, arterial: boolean, bridge = false) => {
    const from = roadNodeId(a); const to = roadNodeId(b); const id = [from,to].sort().join("/");
    nodes.set(from, { ...a, id: from }); nodes.set(to, { ...b, id: to });
    edges.set(id, { id, from, to, width: arterial ? 8 : 5, kind: arterial ? "arterial" : "local", points: [a,b], bridge });
  };
  for (let row = -8; row < 9; row += 1) for (let col = -11; col < 12; col += 1) {
    if (col === 0) continue;
    const x0 = xs.get(col)!; const x1 = xs.get(col+1)!; const z0 = zs.get(row)!; const z1 = zs.get(row+1)!;
    const polygon = [warp(x0,z0),warp(x1,z0),warp(x1,z1),warp(x0,z1)];
    // Reject whole fringe blocks; never draw a road or parcel through coast/river.
    if (polygon.some((p) => !terrain.buildable(p.x,p.z))) continue;
    if (polygon.some((p,i) => { const q=polygon[(i+1)%4]; return !terrain.buildable((p.x+q.x)/2,(p.z+q.z)/2); })) continue;
    const center = warp((x0+x1)/2,(z0+z1)/2);
    const reserved = publicSites.some((site) => polygonDistance(site, polygon) > -site.radius);
    const zone: Zone = col > 0 && col < 4 && row < 2 ? "downtown" : row > 3 ? "waterfront" : col < -3 ? "residential" : "commercial";
    const id = `plan:${col}:${row}`; const parcels: Parcel[] = [];
    const columnCount = Math.max(3, Math.floor((x1-x0-14)/7.2));
    for (let side = 0; side < 2 && !reserved; side += 1) for (let index=0; index<columnCount; index+=1) {
      const a=polygon[side===0?0:3]; const b=polygon[side===0?1:2];
      const length=Math.hypot(b.x-a.x,b.z-a.z); const dx=(b.x-a.x)/length; const dz=(b.z-a.z)/length;
      const t=(index+0.5)/columnCount; const inset=side===0?12:-12;
      const p={x:a.x+dx*(7+(length-14)*t)-dz*inset,z:a.z+dz*(7+(length-14)*t)+dx*inset};
      const half=3.6;
      if (polygonDistance(p,polygon)<half+5) continue;
      if (publicSites.some((site)=>Math.hypot(p.x-site.x,p.z-site.z)<site.radius+9)) continue;
      parcels.push({...p,id:`${id}/${side}:${index}`,blockId:id,yaw:-Math.atan2(dz,dx),zone,width:Math.min(7.2,(length-14)/columnCount),depth:8});
    }
    blocks.push({ id,districtId:"",...center,width:x1-x0,depth:z1-z0,zone,parcels,polygon });
    polygon.forEach((p,i)=>addEdge(p,polygon[(i+1)%4],i%2===0?row%3===0:col%3===0));
  }
  const bridges: CityLayout["bridges"] = [];
  for (const row of [-5,-1,3]) {
    const from=warp(xs.get(0)!,zs.get(row)!); const to=warp(xs.get(1)!,zs.get(row)!);
    if (!nodes.has(roadNodeId(from)) || !nodes.has(roadNodeId(to))) continue;
    addEdge(from,to,true,true);
    bridges.push({from,to,angle:Math.atan2(to.z-from.z,to.x-from.x),length:Math.hypot(to.x-from.x,to.z-from.z)});
  }
  const parkTrees: CityLayout["parkTrees"] = [];
  for(let i=0;i<1000;i+=1){
    const x=(random(`tx${i}`)-0.5)*1180; const z=(random(`tz${i}`)-0.5)*950;
    const park=publicSites.some((s)=>s.kind==="park"&&Math.hypot(x-s.x,z-s.z)<s.radius-5);
    const bank=Math.abs(x-riverX(z))-riverWidth(z);
    if(height(x,z)<2.5 || (!park && bank>23 && z>-305))continue;
    if([...edges.values()].some((e)=>segmentDistance({x,z},e.points[0],e.points[1])<e.width/2+3))continue;
    parkTrees.push({x,z,y:height(x,z),seed:random(`tree${i}`)});
  }
  const carPaths = blocks.filter((b,i)=>b.parcels.length>0&&i%7===0).map((b)=>[...b.polygon,b.polygon[0]]);

  // District anchors: token-ranked hosts settle into these quarters — main host
  // downtown, second the old western center, the other two the southern banks.
  // The river separates east from west; an elevated expressway separates north
  // from south (see highways below), so every host quarter has a visible border.
  const districtAnchors = [
    { x: 130, z: -90 },   // downtown, east bank north of the expressway
    { x: -210, z: -90 },  // old western center
    { x: 250, z: 300 },   // east bank, south of the expressway
    { x: -180, z: 290 },  // west bank, south of the expressway
  ];

  // Internal elevated expressway along the block grid line zs(1): follows the
  // same warp as the streets, clipped to buildable land so it never runs on
  // stilts across open water. Parcels are inset 12 from block edges, which
  // already clears the 10.5-wide deck.
  const highwayZ = zs.get(1)!;
  const highwayRuns: Vec2[][] = [];
  // One continuous line: trim only the open-sea ends; the river gap stays in —
  // the deck crosses the river on piers (a real bridge), it must not stop at
  // the banks.
  const line: Vec2[] = [];
  for (let i = 0; i <= 80; i += 1) {
    const x = xs.get(-11)! + (xs.get(12)! - xs.get(-11)!) * (i / 80);
    line.push(warp(x, highwayZ));
  }
  const onLand = (p: Vec2) => terrain.buildable(p.x, p.z);
  let start = 0;
  let end = line.length - 1;
  while (start < line.length && !onLand(line[start])) start += 1;
  while (end >= 0 && !onLand(line[end])) end -= 1;
  start = Math.max(0, start - 1);
  end = Math.min(line.length - 1, end + 1);
  if (end - start >= 8) highwayRuns.push(line.slice(start, end + 1));

  return { blocks,roadNodes:[...nodes.values()],roadEdges:[...edges.values()],terrain,extent:1600,coast,river,publicSites,parkTrees,
    urbanBounds:{left:-570,right:570,north:-350,south:430},bridges,boundsRadius:650,carPaths,districtAnchors,highways:highwayRuns };
}
