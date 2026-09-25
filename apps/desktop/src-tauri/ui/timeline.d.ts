// Type surface of the UMD module timeline.js for the React workbench (allowJs is off).
// Under a CommonJS wrapper (Vite production build, esbuild cjs) the factory result is
// `module.exports`, i.e. the default import; see SessionTrace.tsx::timelineGeometry.
declare const TimelineGeometry: {
  buildTimeline(spec: unknown): string;
};
export default TimelineGeometry;
