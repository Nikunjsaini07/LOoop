import { renderReader } from "@/lib/server/render-reader";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return renderReader("home", await searchParams);
}
