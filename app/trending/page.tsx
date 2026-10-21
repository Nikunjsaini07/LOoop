import { renderReader } from "@/lib/server/render-reader";

export const metadata = { title: "Trending — Readwell" };

export const dynamic = "force-dynamic";

export default async function Trending({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return renderReader("trending", await searchParams);
}
