import { ANVENDELSE_GROUPS } from "./bbr-codes";

// Farvelægning af jordstykker (F10/F11). Værdierne ligger som properties i
// tilesettet (aar, anv, vm2), så farvelægningen sker helt i klienten.

export type ColorDimension = "none" | "aar" | "anv" | "vm2";

export type LegendItem = { color: string; label: string };

export const NO_DATA_COLOR = "#cfd4da";

type Step = { from: number; color: string; label: string };

const AAR_STEPS: Step[] = [
  { from: -Infinity, color: "#5b1a4b", label: "Før 1900" },
  { from: 1900, color: "#8f2d56", label: "1900–1929" },
  { from: 1930, color: "#d1495b", label: "1930–1959" },
  { from: 1960, color: "#ee964b", label: "1960–1979" },
  { from: 1980, color: "#f4d35e", label: "1980–1999" },
  { from: 2000, color: "#8ac926", label: "2000–2014" },
  { from: 2015, color: "#1a936f", label: "2015 og senere" },
];

const VM2_STEPS: Step[] = [
  { from: -Infinity, color: "#edf8fb", label: "Under 2.000 kr./m²" },
  { from: 2000, color: "#bfd3e6", label: "2.000–5.000" },
  { from: 5000, color: "#9ebcda", label: "5.000–10.000" },
  { from: 10000, color: "#8c96c6", label: "10.000–20.000" },
  { from: 20000, color: "#8856a7", label: "20.000–40.000" },
  { from: 40000, color: "#810f7c", label: "Over 40.000 kr./m²" },
];

export const DIMENSIONS: { key: ColorDimension; label: string; title: string }[] = [
  { key: "none", label: "Ingen", title: "Ingen farvelægning" },
  { key: "aar", label: "Byggeår", title: "Ældste opførelsesår på grunden" },
  { key: "anv", label: "Anvendelse", title: "Primær BBR-anvendelse" },
  { key: "vm2", label: "Værdi/m²", title: "Ejendomsværdi pr. m² grund" },
];

// Mapbox-udtryk holdes som løst typede arrays, så modulet kan testes uden
// mapbox-gl.
type Expr = unknown[];

function stepExpression(prop: string, steps: Step[]): Expr {
  const expr: unknown[] = ["step", ["get", prop], steps[0].color];
  for (const s of steps.slice(1)) expr.push(s.from, s.color);
  return [
    "case",
    ["!", ["has", prop]],
    NO_DATA_COLOR,
    ["<=", ["to-number", ["get", prop], 0], 0],
    NO_DATA_COLOR,
    expr,
  ];
}

function anvExpression(): Expr {
  const expr: unknown[] = ["step", ["to-number", ["get", "anv"], 0], NO_DATA_COLOR];
  let prevMax: number | null = null;
  for (const g of ANVENDELSE_GROUPS) {
    // Huller mellem grupperne (fx 600-899) får "ingen data"-farve.
    if (prevMax !== null && g.min > prevMax + 1) expr.push(prevMax + 1, NO_DATA_COLOR);
    expr.push(g.min, g.color);
    prevMax = g.max;
  }
  if (prevMax !== null) expr.push(prevMax + 1, NO_DATA_COLOR);
  return expr;
}

export function fillColorExpression(dim: ColorDimension): Expr | string {
  switch (dim) {
    case "aar":
      return stepExpression("aar", AAR_STEPS);
    case "vm2":
      return stepExpression("vm2", VM2_STEPS);
    case "anv":
      return anvExpression();
    default:
      return "#4263eb";
  }
}

export function legendFor(dim: ColorDimension): LegendItem[] {
  switch (dim) {
    case "aar":
      return [...AAR_STEPS.map(({ color, label }) => ({ color, label })), noData()];
    case "vm2":
      return [...VM2_STEPS.map(({ color, label }) => ({ color, label })), noData()];
    case "anv":
      return [...ANVENDELSE_GROUPS.map(({ color, label }) => ({ color, label })), noData()];
    default:
      return [];
  }
}

function noData(): LegendItem {
  return { color: NO_DATA_COLOR, label: "Ingen data" };
}

/** Samme logik som udtrykkene, til test og tooltips. */
export function colorForValue(dim: ColorDimension, value: number | undefined | null): string {
  if (value === undefined || value === null || !(value > 0)) return NO_DATA_COLOR;
  const steps = dim === "aar" ? AAR_STEPS : dim === "vm2" ? VM2_STEPS : null;
  if (steps) {
    let color = steps[0].color;
    for (const s of steps) if (value >= s.from) color = s.color;
    return color;
  }
  if (dim === "anv") {
    return ANVENDELSE_GROUPS.find((g) => value >= g.min && value <= g.max)?.color ?? NO_DATA_COLOR;
  }
  return NO_DATA_COLOR;
}
