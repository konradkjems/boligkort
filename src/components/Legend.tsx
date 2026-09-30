import { DIMENSIONS, legendFor, type ColorDimension } from "@/lib/colorize";

export default function Legend({
  dimension,
  onChange,
  note,
}: {
  dimension: ColorDimension;
  onChange: (d: ColorDimension) => void;
  note?: string;
}) {
  const items = legendFor(dimension);
  const title = DIMENSIONS.find((d) => d.key === dimension)?.title;
  return (
    <div className="panel w-64 p-3 text-sm">
      <div className="mb-2 font-semibold text-slate-800">Farvelæg matrikler</div>
      <div role="radiogroup" aria-label="Farvelægning" className="grid grid-cols-2 gap-1">
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            role="radio"
            aria-checked={dimension === d.key}
            onClick={() => onChange(d.key)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              dimension === d.key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {items.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-slate-500">{title}</div>
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.label} className="flex items-center gap-2 text-xs text-slate-700">
                <span
                  className="inline-block h-3 w-5 rounded-sm border border-black/10"
                  style={{ background: i.color }}
                />
                {i.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
