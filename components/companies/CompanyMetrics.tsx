import type { CompanySummary } from "@/lib/company-types";

export const formatCount = (value: number) => value.toLocaleString("en-US");

export default function CompanyMetrics({ company, available }: { company: CompanySummary; available: boolean }) {
  return <dl className="company-metrics">
    {([
      ["Blogs", company.blogCount, true], ["Followers", company.followers, available],
      ["Bookmarks", company.bookmarks, available], ["Read logs", company.readLogs, available],
    ] as const).map(([label, value, known]) => <div key={label}><dt>{label}</dt><dd title={known ? undefined : "Community totals are temporarily unavailable"}>{known ? formatCount(value) : "—"}</dd></div>)}
  </dl>;
}
