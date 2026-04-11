import { db } from "./db";
import { listPublicAuthAccountsByIds, listStoredAuthAccounts } from "./auth-account-store";
import type { StoredAuthAccount } from "./auth-storage";

/* ── Users ─────────────────────────────────────────────────── */

export type AdminUser = {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
  birthDate: string | null;
  birthPlaceText: string | null;
  hasProfile: boolean;
  paidOrderCount: number;
  voidCount: number;
};

type UserOrderSummary = {
  paidOrderCount: number;
  totalPaid: number;
  isVip: boolean;
  vipProductId: string | null;
  vipPaidAt: string | null;
};

function getUserOrderSummaryMap() {
  const paidRows = db.prepare(
    `SELECT user_id, COUNT(*) AS paid_order_count, COALESCE(SUM(amount), 0) AS total_paid
     FROM orders
     WHERE status = 'paid'
     GROUP BY user_id`,
  ).all() as Array<{ user_id: string; paid_order_count: number; total_paid: number }>;

  const vipRows = db.prepare(
    `SELECT user_id, product_id, paid_at
     FROM orders
     WHERE status = 'paid' AND product_id IN ('membership', 'yearly')
     ORDER BY paid_at DESC`,
  ).all() as Array<{ user_id: string; product_id: string; paid_at: string | null }>;

  const summaryMap = new Map<string, UserOrderSummary>();
  for (const row of paidRows) {
    summaryMap.set(row.user_id, {
      paidOrderCount: row.paid_order_count,
      totalPaid: row.total_paid,
      isVip: false,
      vipProductId: null,
      vipPaidAt: null,
    });
  }

  for (const row of vipRows) {
    const current = summaryMap.get(row.user_id) ?? {
      paidOrderCount: 0,
      totalPaid: 0,
      isVip: false,
      vipProductId: null,
      vipPaidAt: null,
    };
    if (!current.isVip) {
      current.isVip = true;
      current.vipProductId = row.product_id;
      current.vipPaidAt = row.paid_at;
      summaryMap.set(row.user_id, current);
    }
  }

  return summaryMap;
}

function getUserVoidCountMap() {
  const rows = db.prepare(
    `SELECT user_id, COUNT(*) AS void_count
     FROM void_analysis_requests
     GROUP BY user_id`,
  ).all() as Array<{ user_id: string; void_count: number }>;

  return new Map(rows.map((row) => [row.user_id, row.void_count]));
}

function mapStoredAccountToAdminUser(
  account: StoredAuthAccount,
  orderSummaryMap: Map<string, UserOrderSummary>,
  voidCountMap: Map<string, number>,
): AdminUserDetail {
  const orderSummary = orderSummaryMap.get(account.id);
  const birthDate = account.onboardingProfile?.birthTime?.birthDate ?? null;
  const birthPlaceText = account.onboardingProfile?.birthPlace?.fullText ?? null;

  return {
    id: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    createdAt: account.createdAt,
    birthDate,
    birthPlaceText,
    hasProfile: birthDate != null,
    paidOrderCount: orderSummary?.paidOrderCount ?? 0,
    voidCount: voidCountMap.get(account.id) ?? 0,
    totalPaid: orderSummary?.totalPaid ?? 0,
    isVip: orderSummary?.isVip ?? false,
    vipProductId: orderSummary?.vipProductId ?? null,
    vipPaidAt: orderSummary?.vipPaidAt ?? null,
  };
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const users = await getAdminUsersFiltered();
  return users.map(({ totalPaid: _totalPaid, isVip: _isVip, vipProductId: _vipProductId, vipPaidAt: _vipPaidAt, ...user }) => user);
}

/* ── Orders ─────────────────────────────────────────────────── */

export type AdminOrder = {
  id: string;
  username: string;
  phoneNumber: string;
  productId: string;
  amount: number;
  status: string;
  paymentKey: string | null;
  paymentType: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmount: number;
  refundReason: string | null;
  refundSource: string | null;
  refundReference: string | null;
  refundEvents: AdminRefundEvent[];
};

export type AdminRefundEvent = {
  id: string;
  source: string;
  reason: string | null;
  amount: number;
  status: string;
  externalRef: string | null;
  transactionId: string | null;
  purchaseToken: string | null;
  metadata: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type AdminOrderMetadata = {
  questionText?: string;
  category?: string;
  questionType?: string;
  chartHash?: string | null;
};

export type AdminOrderDetail = AdminOrder & {
  userId: string;
  providerRef: string | null;
  analysisId: string | null;
  metadata: AdminOrderMetadata | null;
  voidCreditLedger: AdminVoidCreditLedgerEntry[];
};

export type AdminVoidCreditLedgerEntry = {
  id: string;
  skuId: string;
  transactionId: string | null;
  purchaseToken: string | null;
  sourceType: string;
  totalCredits: number;
  consumedCredits: number;
  refundedCredits: number;
  remainingCredits: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type RefundEventRow = {
  id: string;
  order_id: string;
  source: string;
  reason: string | null;
  amount: number;
  status: string;
  external_ref: string | null;
  transaction_id: string | null;
  purchase_token: string | null;
  metadata?: string | null;
  created_at: string;
  processed_at: string | null;
};

type VoidCreditLedgerRow = {
  id: string;
  order_id: string | null;
  sku_id: string;
  transaction_id: string | null;
  purchase_token: string | null;
  source_type: string;
  total_credits: number;
  consumed_credits: number;
  refunded_credits: number;
  status: string;
  created_at: string;
  updated_at: string;
};

function parseOrderMetadata(value: string | null): AdminOrderMetadata | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AdminOrderMetadata;
  } catch {
    return null;
  }
}

function getRefundEventsByOrderIds(
  orderIds: string[],
  options: { includeMetadata?: boolean } = {},
): Map<string, AdminRefundEvent[]> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const metadataSelect = options.includeMetadata ? ", metadata" : "";
  const refundEvents = db.prepare(
    `SELECT id, order_id, source, reason, amount, status, external_ref, transaction_id, purchase_token${metadataSelect}, created_at, processed_at
     FROM refund_events
     WHERE order_id IN (${orderIds.map(() => "?").join(", ")})
     ORDER BY created_at DESC`,
  ).all(orderIds) as RefundEventRow[];

  const refundEventsByOrderId = new Map<string, AdminRefundEvent[]>();

  for (const event of refundEvents) {
    const bucket = refundEventsByOrderId.get(event.order_id) ?? [];
    bucket.push({
      id: event.id,
      source: event.source,
      reason: event.reason,
      amount: event.amount,
      status: event.status,
      externalRef: event.external_ref,
      transactionId: event.transaction_id,
      purchaseToken: event.purchase_token,
      metadata: options.includeMetadata ? event.metadata ?? null : null,
      createdAt: event.created_at,
      processedAt: event.processed_at,
    });
    refundEventsByOrderId.set(event.order_id, bucket);
  }

  return refundEventsByOrderId;
}

function getVoidCreditLedgerByOrderIds(orderIds: string[]): Map<string, AdminVoidCreditLedgerEntry[]> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const ledgerRows = db.prepare(
    `SELECT id, order_id, sku_id, transaction_id, purchase_token, source_type,
            total_credits, consumed_credits, refunded_credits, status, created_at, updated_at
     FROM void_credit_ledger
     WHERE order_id IN (${orderIds.map(() => "?").join(", ")})
     ORDER BY created_at DESC, id DESC`,
  ).all(orderIds) as VoidCreditLedgerRow[];

  const ledgerByOrderId = new Map<string, AdminVoidCreditLedgerEntry[]>();

  for (const row of ledgerRows) {
    if (!row.order_id) {
      continue;
    }

    const bucket = ledgerByOrderId.get(row.order_id) ?? [];
    bucket.push({
      id: row.id,
      skuId: row.sku_id,
      transactionId: row.transaction_id,
      purchaseToken: row.purchase_token,
      sourceType: row.source_type,
      totalCredits: row.total_credits,
      consumedCredits: row.consumed_credits,
      refundedCredits: row.refunded_credits,
      remainingCredits: Math.max(0, row.total_credits - row.consumed_credits - row.refunded_credits),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    ledgerByOrderId.set(row.order_id, bucket);
  }

  return ledgerByOrderId;
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  return getAdminOrdersFiltered();
}

/* ── Void Analysis ──────────────────────────────────────────── */

export type AdminVoidRequest = {
  id: string;
  username: string;
  category: string;
  questionText: string;
  status: string;
  createdAt: string;
};

export async function getAdminVoidRequests(): Promise<AdminVoidRequest[]> {
  const rows = db.prepare(
    `SELECT id, user_id, category, question_text, status, created_at
     FROM void_analysis_requests
     ORDER BY created_at DESC
     LIMIT 300`,
  ).all() as Array<{
    id: string;
    user_id: string;
    category: string;
    question_text: string;
    status: string;
    created_at: string;
  }>;

  const accounts = await listPublicAuthAccountsByIds(rows.map((row) => row.user_id));
  const usernameById = new Map(accounts.map((account) => [account.id, account.username]));

  return rows.map((row) => ({
    id: row.id,
    username: usernameById.get(row.user_id) ?? "알 수 없음",
    category: row.category,
    questionText: row.question_text,
    status: row.status,
    createdAt: row.created_at,
  }));
}

/* ── Enhanced User Search ─────────────────────────────────────── */

export type AdminUserDetail = AdminUser & {
  totalPaid: number;
  isVip: boolean;
  vipProductId: string | null;
  vipPaidAt: string | null;
};

export async function getAdminUsersFiltered(
  search: string = "",
  vipFilter: "" | "vip" | "normal" = "",
  limit = 300,
): Promise<AdminUserDetail[]> {
  const [accounts, orderSummaryMap, voidCountMap] = await Promise.all([
    listStoredAuthAccounts(),
    Promise.resolve(getUserOrderSummaryMap()),
    Promise.resolve(getUserVoidCountMap()),
  ]);

  const normalizedSearch = search.trim().toLowerCase();

  return accounts
    .map((account) => mapStoredAccountToAdminUser(account, orderSummaryMap, voidCountMap))
    .filter((user) => {
      if (vipFilter === "vip" && !user.isVip) return false;
      if (vipFilter === "normal" && user.isVip) return false;
      if (!normalizedSearch) return true;
      return (
        user.username.toLowerCase().includes(normalizedSearch) ||
        user.phoneNumber.toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

/* ── Filtered Orders ──────────────────────────────────────────── */

export async function getAdminOrdersFiltered(
  status: string = "",
  product: string = "",
  limit = 500,
): Promise<AdminOrder[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status)  { conditions.push("o.status = ?");     params.push(status); }
  if (product) { conditions.push("o.product_id = ?"); params.push(product); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT o.id, o.user_id, o.product_id, o.amount, o.status, o.payment_key, o.payment_type, o.created_at, o.paid_at,
              o.refunded_at, o.refund_amount, o.refund_reason, o.refund_source, o.refund_reference
       FROM orders o
       ${where}
       ORDER BY o.created_at DESC LIMIT ?`,
    )
    .all(params) as {
    id: string;
    user_id: string;
    product_id: string;
    amount: number;
    status: string;
    payment_key: string | null;
    payment_type: string | null;
    created_at: string;
    paid_at: string | null;
    refunded_at: string | null;
    refund_amount: number;
    refund_reason: string | null;
    refund_source: string | null;
    refund_reference: string | null;
  }[];

  const accounts = await listPublicAuthAccountsByIds(rows.map((row) => row.user_id));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const refundEventsByOrderId = getRefundEventsByOrderIds(rows.map((row) => row.id));

  return rows.map((r) => ({
    id: r.id,
    username: accountById.get(r.user_id)?.username ?? "알 수 없음",
    phoneNumber: accountById.get(r.user_id)?.phoneNumber ?? "—",
    productId: r.product_id,
    amount: r.amount,
    status: r.status,
    paymentKey: r.payment_key,
    paymentType: r.payment_type,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    refundedAt: r.refunded_at,
    refundAmount: r.refund_amount,
    refundReason: r.refund_reason,
    refundSource: r.refund_source,
    refundReference: r.refund_reference,
    refundEvents: refundEventsByOrderId.get(r.id) ?? [],
  }));
}

export async function getAdminOrderById(orderId: string): Promise<AdminOrderDetail | null> {
  const row = db.prepare(
    `SELECT o.id, o.user_id, o.product_id, o.amount, o.status, o.payment_key, o.payment_type,
            o.provider_ref, o.analysis_id, o.metadata, o.created_at, o.paid_at,
            o.refunded_at, o.refund_amount, o.refund_reason, o.refund_source, o.refund_reference
     FROM orders o
     WHERE o.id = @orderId
     LIMIT 1`,
  ).get({ orderId }) as {
    id: string;
    user_id: string;
    product_id: string;
    amount: number;
    status: string;
    payment_key: string | null;
    payment_type: string | null;
    provider_ref: string | null;
    analysis_id: string | null;
    metadata: string | null;
    created_at: string;
    paid_at: string | null;
    refunded_at: string | null;
    refund_amount: number;
    refund_reason: string | null;
    refund_source: string | null;
    refund_reference: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  const accounts = await listPublicAuthAccountsByIds([row.user_id]);
  const account = accounts[0];
  const refundEventsByOrderId = getRefundEventsByOrderIds([row.id], { includeMetadata: true });
  const voidCreditLedgerByOrderId = getVoidCreditLedgerByOrderIds([row.id]);

  return {
    id: row.id,
    userId: row.user_id,
    username: account?.username ?? "알 수 없음",
    phoneNumber: account?.phoneNumber ?? "—",
    productId: row.product_id,
    amount: row.amount,
    status: row.status,
    paymentKey: row.payment_key,
    paymentType: row.payment_type,
    providerRef: row.provider_ref,
    analysisId: row.analysis_id,
    metadata: parseOrderMetadata(row.metadata),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    refundAmount: row.refund_amount,
    refundReason: row.refund_reason,
    refundSource: row.refund_source,
    refundReference: row.refund_reference,
    refundEvents: refundEventsByOrderId.get(row.id) ?? [],
    voidCreditLedger: voidCreditLedgerByOrderId.get(row.id) ?? [],
  };
}

/* ── Subscriptions ────────────────────────────────────────────── */

export type AdminSubscription = {
  orderId: string;
  userId: string;
  username: string;
  phoneNumber: string;
  productId: string;
  amount: number;
  paidAt: string;
  createdAt: string;
};

export async function getAdminSubscriptions(limit = 300): Promise<AdminSubscription[]> {
  const rows = db
    .prepare(
      `SELECT o.id, o.user_id, o.product_id, o.amount, o.paid_at, o.created_at
       FROM orders o
       WHERE o.product_id IN ('membership', 'yearly') AND o.status = 'paid'
       ORDER BY o.paid_at DESC LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    user_id: string;
    product_id: string;
    amount: number;
    paid_at: string;
    created_at: string;
  }[];

  const accounts = await listPublicAuthAccountsByIds(rows.map((row) => row.user_id));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return rows.map((r) => ({
    orderId: r.id,
    userId: r.user_id,
    username: accountById.get(r.user_id)?.username ?? "알 수 없음",
    phoneNumber: accountById.get(r.user_id)?.phoneNumber ?? "—",
    productId: r.product_id,
    amount: r.amount,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  }));
}

/* ── Void Analysis ────────────────────────────────────────────── */

export type VoidTopQuestion = { questionText: string; category: string; count: number };
export type VoidHeavyUser   = { username: string; userId: string; count: number };
export type AdminVoidAnalysis = {
  topQuestions: VoidTopQuestion[];
  heavyUsers:   VoidHeavyUser[];
};

export async function getAdminVoidAnalysis(): Promise<AdminVoidAnalysis> {
  const topQuestions = db
    .prepare(
      `SELECT question_text, category, COUNT(*) as count
       FROM void_analysis_requests
       WHERE question_text IS NOT NULL AND question_text != ''
       GROUP BY question_text ORDER BY count DESC LIMIT 20`,
    )
    .all() as { question_text: string; category: string; count: number }[];

  const heavyUsers = db
    .prepare(
      `SELECT v.user_id, COUNT(*) as count
       FROM void_analysis_requests v
       GROUP BY v.user_id ORDER BY count DESC LIMIT 20`,
    )
    .all() as { user_id: string; count: number }[];

  const accounts = await listPublicAuthAccountsByIds(heavyUsers.map((row) => row.user_id));
  const usernameById = new Map(accounts.map((account) => [account.id, account.username]));

  return {
    topQuestions: topQuestions.map((r) => ({
      questionText: r.question_text,
      category:     r.category,
      count:        r.count,
    })),
    heavyUsers: heavyUsers.map((r) => ({
      username: usernameById.get(r.user_id) ?? "알 수 없음",
      userId:   r.user_id,
      count:    r.count,
    })),
  };
}
