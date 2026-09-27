import { execSync } from "child_process";

// Android tap/swipe coordinates and `screencap` output live in physical pixels,
// but the host downscales a wide screenshot before the vision model sees it,
// which desyncs "what the model looks at" from "what a tap hits". To fix that we
// return the screenshot in density-independent pixels (dp) and scale incoming
// tap/swipe coordinates back up to pixels by the same factor.
//
// scale = density_dpi / 160  (e.g. 480dpi → 3.0). The same factor must be used
// for the screenshot downscale and the tap/swipe upscale, so both go through
// this cached helper. Cached per device because it never changes for a session
// and we do not want to shell out to `wm density` on every tap.

const scaleCache = new Map<string, number>();

export function getAndroidScale(deviceId: string): number {
  const cached = scaleCache.get(deviceId);
  if (cached !== undefined) return cached;

  let scale = 1;
  try {
    const out = execSync(`adb -s "${deviceId}" shell wm density`, {
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    // `wm density` prints "Physical density: N" and, when the user changed the
    // display size, "Override density: N". The override is the density the app
    // actually renders at, so prefer it when present.
    const override = out.match(/Override density:\s*(\d+)/);
    const physical = out.match(/Physical density:\s*(\d+)/);
    const dpi = override ? Number(override[1]) : physical ? Number(physical[1]) : NaN;
    if (Number.isFinite(dpi) && dpi > 0) {
      scale = Math.max(1, dpi / 160);
    }
  } catch {
    // Leave scale at 1 (no scaling) — matches the pre-fix behaviour.
  }

  scaleCache.set(deviceId, scale);
  return scale;
}
