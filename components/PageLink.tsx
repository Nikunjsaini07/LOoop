import type { ComponentProps } from "react";

/** Native navigation avoids the Vinext production RSC prefetch/navigation failure. */
export default function PageLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
