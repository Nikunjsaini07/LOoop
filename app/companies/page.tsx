import type { Metadata } from "next";
import CompaniesView from "@/components/CompaniesView";
import { loadCompanyDirectory } from "@/lib/backend";
import "./companies.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Companies — Readwell",
  description: "Find the engineering teams worth reading. Explore company blogs, follow your favorites, and see what readers are saving.",
};

export default async function CompaniesPage() {
  return <CompaniesView initial={await loadCompanyDirectory()} />;
}
