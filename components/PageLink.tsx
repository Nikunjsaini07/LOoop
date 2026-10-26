import type { ComponentProps } from "react";
import NextLink from "next/link";

export default function PageLink({ href, ...props }: ComponentProps<"a">) {
  if (href && (href.startsWith("/") || href.startsWith("#"))) {
    return <NextLink href={href} prefetch={false} {...props} />;
  }
  return <a href={href} {...props} />;
}
