/** Pure structure profiles shared by the renderer and the driving surface compiler. */
/** 区界高架桥面：BOX 底面在 DECK_Y、厚 DECK_THICKNESS，行车面在两者之和。
 *  路灯曾按 8.2（板底）立杆，光斑埋进桥面板、又因半径大于半幅桥宽漏到桥下地面。 */
export const EXPRESSWAY_DECK_Y = 8.2;
export const EXPRESSWAY_DECK_THICKNESS = 0.9;
export const EXPRESSWAY_DECK_WIDTH = 10.5;
export const EXPRESSWAY_DECK_TOP = EXPRESSWAY_DECK_Y + EXPRESSWAY_DECK_THICKNESS;
/** 高架两端的匝道长度：环线在海岸/山体处断开成几段，段尾曾悬在 8.2 高的半空、下面是沙地（拍照实测）。 */
export const EXPRESSWAY_RAMP = 90;

/** 每个折线点处的桥面底高：两端各 EXPRESSWAY_RAMP 内平滑落到地面以上 0.3，中段保持 EXPRESSWAY_DECK_Y。
 *  `landingTopAt` 给出某端点处应接上的路面顶高（落在地面路上时 = 渲染路面高）；给了就把那半边匝道的
 *  落地基准整体平移到「端点顶面 = 路面」，在中段由 ease 自然消失。曾一律落到 terrain.height + 0.3：
 *  十五城 22 个匝道端都压在地面路上，端面比路面高 0.24–0.25，是一道开不上去的台阶。 */
export function expresswayDeckHeights(points: Array<{ x: number; z: number }>, groundAt: (x: number, z: number) => number,
  landingTopAt?: (x: number, z: number) => number | null): number[] {
  const along: number[] = [0];
  for (let i = 1; i < points.length; i += 1) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = along[along.length - 1] || 1;
  const closed = Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 0.01;
  const base = (point: { x: number; z: number }) => Math.max(0, groundAt(point.x, point.z)) + 0.3 - EXPRESSWAY_DECK_THICKNESS;
  const shift = (point: { x: number; z: number }) => {
    const top = closed || !landingTopAt ? null : landingTopAt(point.x, point.z);
    return top === null || !Number.isFinite(top) ? 0 : top - EXPRESSWAY_DECK_THICKNESS - base(point);
  };
  const shiftFrom = shift(points[0]); const shiftTo = shift(points[points.length - 1]);
  return points.map((point, i) => {
    if (closed) return EXPRESSWAY_DECK_Y;
    const edge = Math.min(along[i], total - along[i]);
    const u = Math.min(1, edge / EXPRESSWAY_RAMP);
    const ease = u * u * (3 - 2 * u);
    const ground = base(point) + (along[i] <= total - along[i] ? shiftFrom : shiftTo);
    return ground + (EXPRESSWAY_DECK_Y - ground) * ease;
  });
}
