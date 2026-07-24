export type GaugeTone = "normal" | "warning" | "danger";

export function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}
export function gaugeTone(percent: number): GaugeTone {
  if (percent >= 90) return "danger";
  if (percent >= 75) return "warning";
  return "normal";
}

export function gaugeColorClass(percent: number): string {
  return {
    normal: "bg-muted-foreground/70",
    warning: "bg-status-blocked",
    danger: "bg-diff-remove",
  }[gaugeTone(percent)];
}

export function gaugeTextClass(percent: number): string {
  return {
    normal: "text-muted-foreground",
    warning: "text-status-blocked-fg",
    danger: "text-diff-remove",
  }[gaugeTone(percent)];
}

export function resourceLabel(used: number, total: number): string {
  return `${used.toFixed(1)}/${Math.round(total)}GB`;
}
