import { renderReader } from "@/lib/server/render-reader";

export const dynamic = "force-dynamic";

export default async function Profile() {
  return renderReader("profile");
}
