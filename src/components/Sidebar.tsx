"use client";

import { useState } from "react";
import { formatArea, formatDate, formatKr, formatNumber } from "@/lib/format";
import type { Building, PropertyCard } from "@/lib/types";

export type PropertyState = {
  status: "loading" | "ready" | "error";
  card?: PropertyCard;
  error?: string;
  /** Sand mens cachen opdateres i baggrunden (data kan allerede vises). */
  refreshing: boolean;
  retry: () => void;
};

type Props = {
  bfe: number;
  /** Matrikelnr. fra tilen, vises med det samme mens resten loader. */
  hintMnr?: string;
  state: PropertyState;
  onClose: () => void;
};

export default function Sidebar({ bfe, hintMnr, state, onClose }: Props) {
  const { card } = state;
  const title =
    card?.addresses[0]?.text ??
    (card ? `Matr.nr. ${card.matrikel.matrikelnr}, ${card.matrikel.ejerlav}` : null) ??
    (hintMnr ? `Matr.nr. ${hintMnr}` : "Ejendom");

  return (
    <aside
      className="panel pointer-events-auto flex max-h-full w-full flex-col overflow-hidden"
      aria-label="Ejendomsoplysninger"
      aria-busy={state.status === "loading" || state.refreshing}
    >
      <header className="flex items-start gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            BFE {bfe}
            {state.refreshing && card && <span className="ml-2 normal-case">· opdaterer…</span>}
          </div>
          <h2 className="mt-0.5 text-lg font-semibold leading-snug text-slate-900">{title}</h2>
        </div>
        <ShareButton />
        <button
          onClick={onClose}
          aria-label="Luk"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden>
            <path d="M5.3 4 10 8.7 14.7 4 16 5.3 11.3 10l4.7 4.7-1.3 1.3-4.7-4.7L5.3 16 4 14.7 8.7 10 4 5.3z" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {state.status === "error" && !card && (
          <ErrorBox message={state.error ?? "Opslaget fejlede."} onRetry={state.retry} />
        )}
        {state.status === "loading" && !card && <Skeleton />}
        {card && <CardBody card={card} onRetry={state.retry} refreshing={state.refreshing} />}
      </div>

      <footer className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
        Indeholder data fra Datafordeleren (MAT, BBR, DAR, VUR).
        {card && <> Hentet {formatDate(card.fetchedAt)}.</>}
      </footer>
    </aside>
  );
}

function CardBody({
  card,
  onRetry,
  refreshing,
}: {
  card: PropertyCard;
  onRetry: () => void;
  refreshing: boolean;
}) {
  const { matrikel, jordstykker, addresses, buildings, valuation, sourceErrors } = card;
  return (
    <div className="space-y-5">
      {sourceErrors.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Nogle registre svarede ikke: <strong>{sourceErrors.join(", ")}</strong>. Resten vises.
          <button
            onClick={onRetry}
            disabled={refreshing}
            className="ml-2 font-semibold underline disabled:opacity-50"
          >
            Prøv igen
          </button>
        </div>
      )}

      <Section title="Matrikel">
        <Facts
          rows={[
            ["Matrikelnr.", matrikel.matrikelnr],
            ["Ejerlav", matrikel.ejerlav],
            ["Grundareal", formatArea(matrikel.grundareal)],
          ]}
        />
        {jordstykker && jordstykker.length > 1 && (
          <p className="mt-2 text-xs text-slate-500">
            Ejendommen består af {jordstykker.length} jordstykker:{" "}
            {jordstykker.map((j) => j.matrikelnr).join(", ")}
          </p>
        )}
      </Section>

      <Section title={`Adresser (${addresses.length})`}>
        {addresses.length === 0 ? (
          <Empty>Ingen adresser registreret på ejendommen.</Empty>
        ) : (
          <AddressList items={addresses.map((a) => a.text)} />
        )}
      </Section>

      <Section title="Offentlig vurdering">
        {valuation ? (
          <Facts
            rows={[
              ["Vurderingsår", String(valuation.aar)],
              ["Ejendomsværdi", formatKr(valuation.ejendomsvaerdi)],
              ["Grundværdi", formatKr(valuation.grundvaerdi)],
            ]}
          />
        ) : (
          <Empty>
            {sourceErrors.includes("VUR") ? "Vurdering kunne ikke hentes." : "Ingen vurdering fundet."}
          </Empty>
        )}
      </Section>

      <Section title={`Bygninger (${buildings.length})`}>
        {buildings.length === 0 ? (
          <Empty>
            {sourceErrors.includes("BBR") ? "BBR kunne ikke hentes." : "Ingen bygninger i BBR."}
          </Empty>
        ) : (
          <div className="space-y-3">
            {buildings.map((b) => (
              <BuildingCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function BuildingCard({ b }: { b: Building }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">
          {b.anvendelse ?? "Ukendt anvendelse"}
        </div>
        {b.nummer !== undefined && (
          <div className="shrink-0 text-xs text-slate-500">Bygning {b.nummer}</div>
        )}
      </div>
      <Facts
        rows={[
          ["Opført", b.opfoerelsesaar ? String(b.opfoerelsesaar) : "–"],
          ...(b.ombygningsaar ? [["Om-/tilbygget", String(b.ombygningsaar)] as [string, string]] : []),
          ["Bebygget areal", formatArea(b.bebyggetAreal)],
          ["Samlet bygningsareal", formatArea(b.samletBygningsareal)],
          ["Samlet boligareal", formatArea(b.samletBoligareal)],
          ...(b.samletErhvervsareal
            ? [["Erhvervsareal", formatArea(b.samletErhvervsareal)] as [string, string]]
            : []),
          ["Etager", formatNumber(b.etager)],
          ["Tag", b.tag ?? "–"],
          ["Ydervæg", b.ydervaeg ?? "–"],
          [
            "Varme",
            [b.varmeinstallation, b.opvarmningsmiddel].filter(Boolean).join(", ") || "–",
          ],
        ]}
      />
    </div>
  );
}

function AddressList({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <>
      <ul className="space-y-1 text-sm text-slate-800">
        {shown.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {items.length > shown.length && (
        <button onClick={() => setAll(true)} className="mt-1 text-xs font-medium text-blue-700">
          Vis alle {items.length}
        </button>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p>{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800"
      >
        Prøv igen
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Henter data">
      {[3, 2, 3, 6].map((rows, i) => (
        <div key={i}>
          <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
          <div className="space-y-2">
            {Array.from({ length: rows }).map((_, j) => (
              <div key={j} className="h-4 rounded bg-slate-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
            await navigator.share({ url });
          } else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        } catch {
          /* brugeren annullerede */
        }
      }}
      className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      title="Kopiér link til ejendommen"
    >
      {copied ? "Kopieret" : "Del"}
    </button>
  );
}
