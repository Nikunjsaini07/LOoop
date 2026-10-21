import { renderReader } from "@/lib/server/render-reader";

export const metadata = { title: "Your reading — Readwell", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function Profile() {
  return renderReader("profile");
}
