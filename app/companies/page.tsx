import type { Metadata } from "next";
import CompaniesView from "@/components/CompaniesView";
import { loadCompanyDirectory } from "@/lib/server/companies";
import { database } from "@/lib/server/store";
import "./companies.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Companies — readzz",
  description: "Find the engineering teams worth reading. Explore company blogs, follow your favorites, and see what readers are saving.",
};

export default async function CompaniesPage() {
  let db: D1Database | undefined;
  try { db = database(); } catch { /* The collected archive remains browsable offline. */ }
  return <CompaniesView initial={await loadCompanyDirectory(db)} />;
}
