"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AddressSuggestion } from "@/lib/types";

type Props = {
  search: (q: string) => Promise<AddressSuggestion[]>;
  onPick: (s: AddressSuggestion) => void;
};

export default function SearchBox({ search, onPick }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      seq.current++;
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await search(term);
        if (mySeq !== seq.current) return;
        setItems(res);
        setActive(res.length ? 0 : -1);
        setOpen(true);
      } catch {
        if (mySeq !== seq.current) return;
        setItems([]);
        setError("Søgningen fejlede. Prøv igen.");
        setOpen(true);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, search]);

  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (s: AddressSuggestion) => {
    if (s.kind === "vej") {
      // Vejnavn: forfin søgningen med husnummer.
      setQ(s.id);
      inputRef.current?.focus();
      return;
    }
    setQ(s.text);
    setOpen(false);
    onPick(s);
  };

  const showList = open && q.trim().length >= 3;

  return (
    <div className="relative w-full">
      <div className="panel flex items-center gap-2 px-3">
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-slate-400">
          <path d="M8.5 2a6.5 6.5 0 0 1 5.2 10.4l4 4-1.3 1.3-4-4A6.5 6.5 0 1 1 8.5 2Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Søg adresse, fx Smallegade 1, Frederiksberg"
          className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 3) {
              setItems([]);
              setOpen(false);
              setLoading(false);
            }
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active >= 0 && items[active]) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading && (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="panel absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto py-1 text-sm"
        >
          {error && <li className="px-3 py-2 text-red-700">{error}</li>}
          {!error && !loading && items.length === 0 && (
            <li className="px-3 py-2 text-slate-500">Ingen adresser fundet</li>
          )}
          {items.map((s, i) => (
            <li
              id={`${listId}-${i}`}
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-slate-100" : ""}`}
            >
              {s.text}
              {s.kind === "vej" && <span className="ml-1 text-slate-400">…</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
