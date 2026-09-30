const nf = new Intl.NumberFormat("da-DK");

export function formatNumber(n: number | undefined | null): string {
  return n === undefined || n === null ? "–" : nf.format(n);
}

export function formatArea(n: number | undefined | null): string {
  return n === undefined || n === null ? "–" : `${nf.format(n)} m²`;
}

export function formatKr(n: number | undefined | null): string {
  return n === undefined || n === null ? "–" : `${nf.format(Math.round(n))} kr.`;
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(ms);
}

/** Parser et BFE-nummer fra URL-segmentet /e/{bfe}. */
export function parseBfe(raw: string | undefined | null): number | null {
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}
