import crypto from "node:crypto";
import { db } from "./db";
import type { CategoryKey } from "@/app/void/types";

export type VoidRequestStatus = "pending" | "generating" | "complete" | "chart_missing" | "failed";

export type VoidAnalysisRequestRow = {
  id: string;
  userId: string;
  category: CategoryKey;
  questionText: string;
  questionType: "preset" | "custom";
  chartHash: string | null;
  status: VoidRequestStatus;
  analysisJson: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  user_id: string;
  category: string;
  question_text: string;
  question_type: string;
  chart_hash: string | null;
  status: string;
  analysis_json: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRequest(row: DbRow): VoidAnalysisRequestRow {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category as CategoryKey,
    questionText: row.question_text,
    questionType: row.question_type as "preset" | "custom",
    chartHash: row.chart_hash,
    status: row.status as VoidRequestStatus,
    analysisJson: row.analysis_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_CATEGORIES: CategoryKey[] = ["self", "love", "work", "social"];

export type CreateVoidRequestInput = {
  userId: string;
  category: CategoryKey;
  questionText: string;
  questionType: "preset" | "custom";
  chartHash: string | null;
  /** Initial status on creation. Defaults to "generating". */
  initialStatus?: VoidRequestStatus;
};

/**
 * Persist a new analysis request.
 * Validates category and question text before writing.
 * Returns the created record.
 */
export function createVoidAnalysisRequest(
  input: CreateVoidRequestInput
): VoidAnalysisRequestRow {
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }
  const trimmedQuestion = input.questionText.trim();
  if (!trimmedQuestion) {
    throw new Error("questionText must not be empty");
  }
  if (trimmedQuestion.length > 500) {
    throw new Error("questionText exceeds 500 character limit");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO void_analysis_requests
      (id, user_id, category, question_text, question_type, chart_hash, status, analysis_json, created_at, updated_at)
    VALUES
      (@id, @userId, @category, @questionText, @questionType, @chartHash, @status, NULL, @now, @now)
  `).run({
    id,
    userId: input.userId,
    category: input.category,
    questionText: trimmedQuestion,
    questionType: input.questionType,
    chartHash: input.chartHash ?? null,
    status: input.initialStatus ?? "generating",
    now,
  });

  const row = db.prepare(
    "SELECT * FROM void_analysis_requests WHERE id = @id"
  ).get({ id }) as DbRow;

  return rowToRequest(row);
}

/**
 * Fetch a single analysis request by id.
 * Returns null if not found or if the row belongs to a different user.
 */
export function getVoidAnalysisRequest(
  id: string,
  ownerUserId: string
): VoidAnalysisRequestRow | null {
  const row = db.prepare(
    "SELECT * FROM void_analysis_requests WHERE id = @id AND user_id = @ownerUserId"
  ).get({ id, ownerUserId }) as DbRow | undefined;
  return row ? rowToRequest(row) : null;
}

/**
 * Update status and optionally store analysis JSON.
 */
export function updateVoidAnalysisRequest(
  id: string,
  input: { status: VoidRequestStatus; analysisJson?: string },
): void {
  const now = new Date().toISOString();
  if (input.analysisJson !== undefined) {
    db.prepare(
      "UPDATE void_analysis_requests SET status=@status, analysis_json=@json, updated_at=@now WHERE id=@id"
    ).run({ id, status: input.status, json: input.analysisJson, now });
  } else {
    db.prepare(
      "UPDATE void_analysis_requests SET status=@status, updated_at=@now WHERE id=@id"
    ).run({ id, status: input.status, now });
  }
}

/**
 * Return the most recent requests for a user (newest first).
 */
export function listVoidAnalysisRequestsForUser(
  userId: string,
  limit = 20
): VoidAnalysisRequestRow[] {
  const rows = db.prepare(
    "SELECT * FROM void_analysis_requests WHERE user_id = @userId ORDER BY created_at DESC LIMIT @limit"
  ).all({ userId, limit }) as DbRow[];
  return rows.map(rowToRequest);
}
