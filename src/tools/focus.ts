import { execSync } from "child_process";

export interface FocusedWindow {
  windowHash: string;
  displayName: string;
  package: string | null;
  activity: string | null;
  isSystemDialog: boolean;
  isAnrDialog: boolean;
  frame: { x1: number; y1: number; x2: number; y2: number } | null;
}

function dumpWindow(deviceId: string): string {
  try {
    return execSync(`adb -s "${deviceId}" shell dumpsys window`, {
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    }).toString();
  } catch {
    return "";
  }
}

function parseFrame(text: string): FocusedWindow["frame"] {
  // mFrame=Rect(0, 0 - 960, 2142)  — Android 12+ format
  const rectMatch = text.match(/mFrame=Rect\((-?\d+),\s*(-?\d+)\s*-\s*(-?\d+),\s*(-?\d+)\)/);
  if (rectMatch) {
    return {
      x1: Number(rectMatch[1]),
      y1: Number(rectMatch[2]),
      x2: Number(rectMatch[3]),
      y2: Number(rectMatch[4]),
    };
  }
  // frame=[x1,y1][x2,y2]  — older / alternate format
  const bracketMatch = text.match(/\bframe=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (bracketMatch) {
    return {
      x1: Number(bracketMatch[1]),
      y1: Number(bracketMatch[2]),
      x2: Number(bracketMatch[3]),
      y2: Number(bracketMatch[4]),
    };
  }
  return null;
}

export function getAndroidFocusedWindow(deviceId: string): FocusedWindow | null {
  const output = dumpWindow(deviceId);
  if (!output) return null;

  // mCurrentFocus=Window{hash u0 displayName}
  // displayName is either "package/activity" or a free-form string like
  // "Application Not Responding: net.synnode.nullshift"
  const focusMatch = output.match(/mCurrentFocus=Window\{([0-9a-f]+)\s+u\d+\s+([^}]+)\}/);
  if (!focusMatch) return null;

  const windowHash = focusMatch[1];
  const displayName = focusMatch[2].trim();

  const slashIdx = displayName.indexOf("/");
  // System dialogs typically have a label-style name without a slash and
  // start with phrases like "Application Not Responding:".
  const hasSlash = slashIdx > 0 && !displayName.includes(" ");
  const isSystemDialog = !hasSlash;
  const isAnrDialog = /^Application Not Responding\b/i.test(displayName);

  const pkg = hasSlash ? displayName.slice(0, slashIdx) : null;
  const activity = hasSlash ? displayName.slice(slashIdx + 1) : null;

  // Find the per-window block for this hash to extract its frame. The block
  // header looks like:
  //   Window #N Window{<hash> u0 ...}:
  // and the frame line follows within the next ~40 lines.
  let frame: FocusedWindow["frame"] = null;
  const blockHeader = new RegExp(`Window\\{${windowHash}\\s+u\\d+\\s+[^}]+\\}:`);
  const headerMatch = blockHeader.exec(output);
  if (headerMatch) {
    const start = headerMatch.index;
    const slice = output.slice(start, start + 4000);
    frame = parseFrame(slice);
  }

  return {
    windowHash,
    displayName,
    package: pkg,
    activity,
    isSystemDialog,
    isAnrDialog,
    frame,
  };
}
