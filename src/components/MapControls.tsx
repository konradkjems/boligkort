import type { BaseStyle } from "./MapView";

export default function MapControls({
  baseStyle,
  onBaseStyle,
  show3d,
  onShow3d,
}: {
  baseStyle: BaseStyle;
  onBaseStyle: (s: BaseStyle) => void;
  show3d: boolean;
  onShow3d: (v: boolean) => void;
}) {
  return (
    <div className="panel flex items-center gap-1 p-1 text-xs font-medium">
      {(
        [
          ["streets", "Kort"],
          ["satellite", "Luftfoto"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onBaseStyle(key)}
          aria-pressed={baseStyle === key}
          className={`rounded-md px-3 py-1.5 transition ${
            baseStyle === key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          {label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button
        onClick={() => onShow3d(!show3d)}
        aria-pressed={show3d}
        title="Vis bygninger i 3D ved høj zoom"
        className={`rounded-md px-3 py-1.5 transition ${
          show3d ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        3D
      </button>
    </div>
  );
}
