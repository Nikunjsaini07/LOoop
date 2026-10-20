"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2 } from "lucide-react";
import { COMPANY_LOGOS } from "@/lib/company-logos";

export default function CompanyLogo({ companyId, company, size = 18, decorative = false }: {
  companyId: string;
  company: string;
  size?: number;
  decorative?: boolean;
}) {
  const source = COMPANY_LOGOS[companyId];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = source && source !== failedSource;

  return <span className="company-logo" data-company-id={companyId} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
    {available ? <Image src={source} alt={decorative ? "" : `${company} logo`} width={size} height={size} unoptimized onError={() => setFailedSource(source)} />
      : <Building2 size={size} strokeWidth={1.5} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : company} />}
  </span>;
}
