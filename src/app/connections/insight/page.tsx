import { redirect } from "next/navigation";

/** Legacy static insight page — redirect to connections list. */
export default function ConnectionsInsightLegacyPage() {
  redirect("/connections");
}
