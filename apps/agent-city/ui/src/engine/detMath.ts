/**
 * 跨 JS 引擎确定性数学（docs/CITY_ROAD_SIMULATION_ANALYSIS.md §2）。
 *
 * ECMAScript 只规定 + − × ÷ 与 Math.sqrt 必须正确舍入；sin/cos/atan2/hypot/exp/log/pow 是「实现近似」。
 * 实测同一份 createCityPlan 在 Node（V8，守卫）与 JavaScriptCore（App 的 WKWebView）里 30/30 个布局摘要不同：
 * 末位差异经阈值比较（可建、净空、排序）放大成拓扑差异——守卫验证的城市不是用户看到的城市。
 * 这里只用四则运算与 sqrt 重写这些函数（fdlibm 系数），城市规划/布局/模型模块以 `import { DetMath as Math }`
 * 遮蔽全局 Math，调用点不变。精度 ~1e-15 相对误差，远高于城市尺度所需；确定性才是目的。
 */

const PIO2_HI = 1.57079632673412561417e+00; // fdlibm pio2_1
const PIO2_LO = 6.07710050650619224932e-11; // fdlibm pio2_1t
const INV_PIO2 = 6.36619772367581382433e-01;

function kernelSin(x: number): number {
  const z = x * x;
  return x + x * z * (-1.66666666666666324348e-01 + z * (8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04
    + z * (2.75573137070700676789e-06 + z * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10)))));
}
function kernelCos(x: number): number {
  const z = x * x;
  return 1 - 0.5 * z + z * z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * (2.48015872894767294178e-05
    + z * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11)))));
}
/** 返回象限与 [-π/4, π/4] 内的余量（Cody–Waite 两段常数）。 */
function reduce(x: number): [number, number] {
  const k = Math.round(x * INV_PIO2);
  const r = (x - k * PIO2_HI) - k * PIO2_LO;
  return [((k % 4) + 4) % 4, r];
}
function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduce(x);
  return q === 0 ? kernelSin(r) : q === 1 ? kernelCos(r) : q === 2 ? -kernelSin(r) : -kernelCos(r);
}
function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduce(x);
  return q === 0 ? kernelCos(r) : q === 1 ? -kernelSin(r) : q === 2 ? -kernelCos(r) : kernelSin(r);
}

const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
function atanSmall(x: number): number {
  const z = x * x;
  let p = AT[AT.length - 1];
  for (let i = AT.length - 2; i >= 0; i -= 1) p = AT[i] + z * p;
  return x - x * z * p;
}
const PI = 3.141592653589793;
function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const sign = x < 0 ? -1 : 1;
  let a = Math.abs(x);
  let base = 0;
  if (a > 1) { a = 1 / a; base = PI / 2; }
  let r: number;
  if (a > 0.41421356237309503) r = PI / 4 + atanSmall((a - 1) / (a + 1));
  else r = atanSmall(a);
  return sign * (base ? base - r : r);
}
function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0;
}

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
function scale2(value: number, k: number): number {
  let v = value;
  if (k > 0) for (let i = 0; i < k; i += 1) v *= 2;
  else for (let i = 0; i < -k; i += 1) v /= 2;
  return v;
}
function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / 0.6931471805599453);
  const r = (x - k * LN2_HI) - k * LN2_LO;
  let term = 1; let sum = 1;
  for (let n = 1; n <= 16; n += 1) { term = term * r / n; sum += term; }
  return scale2(sum, k);
}
function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (!Number.isFinite(x)) return Infinity;
  let m = x; let e = 0;
  while (m >= 2) { m /= 2; e += 1; }
  while (m < 1) { m *= 2; e -= 1; }
  if (m > 1.4142135623730951) { m /= 2; e += 1; }
  const s = (m - 1) / (m + 1); const s2 = s * s;
  let term = s; let sum = 0;
  for (let n = 1; n <= 25; n += 2) { sum += term / n; term *= s2; }
  return 2 * sum + e * LN2_HI + e * LN2_LO;
}
const LN10 = 2.302585092994046;
function log10(x: number): number { return log(x) / LN10; }
function pow(base: number, exponent: number): number {
  if (exponent === 0) return 1;
  if (base === 0) return exponent > 0 ? 0 : Infinity;
  if (base < 0) return Number.isInteger(exponent) ? (exponent % 2 ? -1 : 1) * exp(exponent * log(-base)) : NaN;
  return exp(exponent * log(base));
}
function hypot(...values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v * v;
  return Math.sqrt(sum);
}

/** 全局 Math 的确定性替身：四则与 sqrt/取整/比较类原样沿用（规范要求正确舍入），超越函数换成上面的实现。 */
const base: Record<string, unknown> = {};
for (const name of Object.getOwnPropertyNames(Math)) base[name] = (Math as unknown as Record<string, unknown>)[name];
export const DetMath = Object.assign(base, { sin, cos, atan, atan2, exp, log, log10, pow, hypot }) as unknown as Math;
