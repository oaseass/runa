export type { CategoryKey } from "./_components/VoidScreen";

export type VoidRequestStatus = "pending" | "processing" | "complete" | "failed";

/** DB-backed analysis request row, as returned from void-store */
export type VoidAnalysisRequest = {
  id: string;
  userId: string;
  category: import("./_components/VoidScreen").CategoryKey;
  questionText: string;
  questionType: "preset" | "custom";
  chartHash: string | null;
  status: VoidRequestStatus;
  analysisJson: string | null;
  createdAt: string;
  updatedAt: string;
};
