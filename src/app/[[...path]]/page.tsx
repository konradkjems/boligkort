import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Explorer from "@/components/Explorer";
import { parseBfe } from "@/lib/format";

// Én side for både "/" og "/e/{bfe}", så kortet ikke genmonteres, når
// den valgte ejendom skifter URL (F9).

function bfeFromPath(path: string[] | undefined): number | null | "invalid" {
  if (!path || path.length === 0) return null;
  if (path.length === 2 && path[0] === "e") return parseBfe(path[1]) ?? "invalid";
  return "invalid";
}

export async function generateMetadata(props: PageProps<"/[[...path]]">): Promise<Metadata> {
  const bfe = bfeFromPath((await props.params).path);
  return typeof bfe === "number" ? { title: `BFE ${bfe} · Ejendomskort` } : {};
}

export default async function Page(props: PageProps<"/[[...path]]">) {
  const bfe = bfeFromPath((await props.params).path);
  if (bfe === "invalid") notFound();
  return <Explorer initialBfe={bfe} />;
}
