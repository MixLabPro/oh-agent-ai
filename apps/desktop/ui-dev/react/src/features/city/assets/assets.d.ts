// Vite 把 import 的 .jpg 解析为打包后的 URL（随应用离线分发，运行时不联网）。
declare module "*.jpg" {
  const url: string;
  export default url;
}
