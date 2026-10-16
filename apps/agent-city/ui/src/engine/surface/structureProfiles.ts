/** Pure structure profiles shared by the renderer and the driving surface compiler. */
/** 区界高架桥面：BOX 底面在 DECK_Y、厚 DECK_THICKNESS，行车面在两者之和。
 *  路灯曾按 8.2（板底）立杆，光斑埋进桥面板、又因半径大于半幅桥宽漏到桥下地面。 */
export const EXPRESSWAY_DECK_Y = 8.2;
export const EXPRESSWAY_DECK_THICKNESS = 0.9;
export const EXPRESSWAY_DECK_WIDTH = 10.5;
export const EXPRESSWAY_DECK_TOP = EXPRESSWAY_DECK_Y + EXPRESSWAY_DECK_THICKNESS;
/** 高架两端的匝道长度：环线在海岸/山体处断开成几段，段尾曾悬在 8.2 高的半空、下面是沙地（拍照实测）。 */
export const EXPRESSWAY_RAMP = 90;

/** 每个折线点处的桥面底高：两端各 EXPRESSWAY_RAMP 内平滑落到地面以上 0.3，中段保持 EXPRESSWAY_DECK_Y。 */
export function expresswayDeckHeights(points: Array<{ x: number; z: number }>, groundAt: (x: number, z: number) => number): number[] {
  const along: number[] = [0];
  for (let i = 1; i < points.length; i += 1) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = along[along.length - 1] || 1;
  const closed = Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 0.01;
  return points.map((point, i) => {
    if (closed) return EXPRESSWAY_DECK_Y;
    const edge = Math.min(along[i], total - along[i]);
    const u = Math.min(1, edge / EXPRESSWAY_RAMP);
    const ease = u * u * (3 - 2 * u);
    const ground = Math.max(0, groundAt(point.x, point.z)) + 0.3 - EXPRESSWAY_DECK_THICKNESS;
    return ground + (EXPRESSWAY_DECK_Y - ground) * ease;
  });
}

