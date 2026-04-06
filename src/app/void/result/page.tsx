import { redirect } from "next/navigation";

/**
 * /void/result (no ID) is a legacy route from before the durable
 * /void/result/[id] flow was added. All analysis requests now go through
 * /void/checkout → createAnalysisRequestAction → /void/result/[id].
 * Redirect to the void entry so the user can start a fresh question.
 */
export default function VoidResultLegacyPage() {
  redirect("/void");
}
