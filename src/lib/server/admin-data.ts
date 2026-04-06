import { db } from "./db";

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

export function getAdminUsers(): AdminUser[] {
  const rows = db
    .prepare(
      `SELECT
        u.id,
        u.username,
        u.phone_number,
        u.created_at,
        op.birth_date,
        op.birth_place_full_text,
        COUNT(DISTINCT CASE WHEN o.status='paid' THEN o.id END) AS paid_order_count,
        COUNT(DISTINCT v.id) AS void_count
      FROM users u
      LEFT JOIN onboarding_profiles op ON op.user_id = u.id
      LEFT JOIN orders o ON o.user_id = u.id
      LEFT JOIN void_analysis_requests v ON v.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC`
    )
    .all() as {
    id: string;
    username: string;
    phone_number: string;
    created_at: string;
    birth_date: string | null;
    birth_place_full_text: string | null;
    paid_order_count: number;
    void_count: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    phoneNumber: r.phone_number,
    createdAt: r.created_at,
    birthDate: r.birth_date,
    birthPlaceText: r.birth_place_full_text,
    hasProfile: r.birth_date != null,
    paidOrderCount: r.paid_order_count,
    voidCount: r.void_count,
  }));
}

/* ── Orders ─────────────────────────────────────────────────── */

export type AdminOrder = {
  id: string;
  username: string;
  phoneNumber: string;
  productId: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
};

export function getAdminOrders(): AdminOrder[] {
  const rows = db
    .prepare(
      `SELECT
        o.id, o.product_id, o.amount, o.status, o.created_at, o.paid_at,
        u.username, u.phone_number
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 300`
    )
    .all() as {
    id: string;
    product_id: string;
    amount: number;
    status: string;
    created_at: string;
    paid_at: string | null;
    username: string;
    phone_number: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    phoneNumber: r.phone_number,
    productId: r.product_id,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
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

export function getAdminVoidRequests(): AdminVoidRequest[] {
  const rows = db
    .prepare(
      `SELECT
        v.id, v.category, v.question_text, v.status, v.created_at,
        u.username
      FROM void_analysis_requests v
      JOIN users u ON u.id = v.user_id
      ORDER BY v.created_at DESC
      LIMIT 300`
    )
    .all() as {
    id: string;
    category: string;
    question_text: string;
    status: string;
    created_at: string;
    username: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    category: r.category,
    questionText: r.question_text,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/* ── Enhanced User Search ─────────────────────────────────────── */

export type AdminUserDetail = AdminUser & {
  totalPaid: number;
  isVip: boolean;
  vipProductId: string | null;
  vipPaidAt: string | null;
};

type UserDetailRow = {
  id: string;
  username: string;
  phone_number: string;
  created_at: string;
  birth_date: string | null;
  birth_place_full_text: string | null;
  paid_order_count: number;
  total_paid: number;
  void_count: number;
  is_vip: number;
  vip_product_id: string | null;
  vip_paid_at: string | null;
};

function mapUserDetail(r: UserDetailRow): AdminUserDetail {
  return {
    id: r.id,
    username: r.username,
    phoneNumber: r.phone_number,
    createdAt: r.created_at,
    birthDate: r.birth_date,
    birthPlaceText: r.birth_place_full_text,
    hasProfile: r.birth_date != null,
    paidOrderCount: r.paid_order_count,
    voidCount: r.void_count,
    totalPaid: r.total_paid,
    isVip: r.is_vip === 1,
    vipProductId: r.vip_product_id ?? null,
    vipPaidAt: r.vip_paid_at ?? null,
  };
}

const USER_DETAIL_SELECT = `
  SELECT u.id, u.username, u.phone_number, u.created_at,
         op.birth_date, op.birth_place_full_text,
         COUNT(DISTINCT CASE WHEN o.status='paid' THEN o.id END) AS paid_order_count,
         COALESCE(SUM(CASE WHEN o.status='paid' THEN o.amount ELSE 0 END), 0) AS total_paid,
         COUNT(DISTINCT v.id) AS void_count,
         CASE WHEN EXISTS(
           SELECT 1 FROM orders vip
           WHERE vip.user_id = u.id AND vip.status='paid'
             AND vip.product_id IN ('membership','yearly')
         ) THEN 1 ELSE 0 END AS is_vip,
         (SELECT vip2.product_id FROM orders vip2
          WHERE vip2.user_id = u.id AND vip2.status='paid'
            AND vip2.product_id IN ('membership','yearly')
          ORDER BY vip2.paid_at DESC LIMIT 1) AS vip_product_id,
         (SELECT vip2.paid_at FROM orders vip2
          WHERE vip2.user_id = u.id AND vip2.status='paid'
            AND vip2.product_id IN ('membership','yearly')
          ORDER BY vip2.paid_at DESC LIMIT 1) AS vip_paid_at
  FROM users u
  LEFT JOIN onboarding_profiles op ON op.user_id = u.id
  LEFT JOIN orders o ON o.user_id = u.id
  LEFT JOIN void_analysis_requests v ON v.user_id = u.id`;

export function getAdminUsersFiltered(
  search: string = "",
  vipFilter: "" | "vip" | "normal" = "",
  limit = 300,
): AdminUserDetail[] {
  const vipWhere =
    vipFilter === "vip"
      ? ` AND EXISTS(SELECT 1 FROM orders ox WHERE ox.user_id = u.id AND ox.status='paid' AND ox.product_id IN ('membership','yearly'))`
      : vipFilter === "normal"
      ? ` AND NOT EXISTS(SELECT 1 FROM orders ox WHERE ox.user_id = u.id AND ox.status='paid' AND ox.product_id IN ('membership','yearly'))`
      : "";

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    return (
      db
        .prepare(
          USER_DETAIL_SELECT +
          ` WHERE (u.username LIKE ? OR u.phone_number LIKE ?)${vipWhere}
          GROUP BY u.id ORDER BY u.created_at DESC LIMIT ?`,
        )
        .all([q, q, limit]) as UserDetailRow[]
    ).map(mapUserDetail);
  }
  return (
    db
      .prepare(
        USER_DETAIL_SELECT +
        ` WHERE 1=1${vipWhere}
        GROUP BY u.id ORDER BY u.created_at DESC LIMIT ?`,
      )
      .all(limit) as UserDetailRow[]
  ).map(mapUserDetail);
}

/* ── Filtered Orders ──────────────────────────────────────────── */

export function getAdminOrdersFiltered(
  status: string = "",
  product: string = "",
  limit = 500,
): AdminOrder[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status)  { conditions.push("o.status = ?");     params.push(status); }
  if (product) { conditions.push("o.product_id = ?"); params.push(product); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT o.id, o.product_id, o.amount, o.status, o.created_at, o.paid_at,
              u.username, u.phone_number
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC LIMIT ?`,
    )
    .all(params) as {
    id: string;
    product_id: string;
    amount: number;
    status: string;
    created_at: string;
    paid_at: string | null;
    username: string;
    phone_number: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    phoneNumber: r.phone_number,
    productId: r.product_id,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
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

export function getAdminSubscriptions(limit = 300): AdminSubscription[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.user_id, o.product_id, o.amount, o.paid_at, o.created_at,
              u.username, u.phone_number
       FROM orders o
       JOIN users u ON u.id = o.user_id
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
    username: string;
    phone_number: string;
  }[];

  return rows.map((r) => ({
    orderId: r.id,
    userId: r.user_id,
    username: r.username,
    phoneNumber: r.phone_number,
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

export function getAdminVoidAnalysis(): AdminVoidAnalysis {
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
      `SELECT u.username, v.user_id, COUNT(*) as count
       FROM void_analysis_requests v
       JOIN users u ON u.id = v.user_id
       GROUP BY v.user_id ORDER BY count DESC LIMIT 20`,
    )
    .all() as { username: string; user_id: string; count: number }[];

  return {
    topQuestions: topQuestions.map((r) => ({
      questionText: r.question_text,
      category:     r.category,
      count:        r.count,
    })),
    heavyUsers: heavyUsers.map((r) => ({
      username: r.username,
      userId:   r.user_id,
      count:    r.count,
    })),
  };
}
