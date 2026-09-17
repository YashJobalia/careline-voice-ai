export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_KEY = "careline.appearance.v1";
export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

// Runs before the first paint. Only validated, fixed values reach the DOM.
export const appearanceScript = `(()=>{let t="system";try{const v=localStorage.getItem("${APPEARANCE_KEY}");if(["system","light","dark"].includes(v))t=v}catch{}const d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light"})()`;
