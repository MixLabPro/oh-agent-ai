// Vite 把 import 的 .jpg 解析为打包后的 URL（随应用离线分发，运行时不联网）。
declare module "*.jpg" {
  const url: string;
  export default url;
}
// .glb 用 ?url 导入：Vite 默认不把 .glb 当静态资源，直接 import 会被当成 JS 解析而报错。
declare module "*.glb?url" {
  const url: string;
  export default url;
}
