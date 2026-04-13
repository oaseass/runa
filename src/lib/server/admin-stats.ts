import { db } from "./db";
import { listStoredAuthAccounts } from "./auth-account-store";

export type DailyPoint = { date: string; value: number };

export type AdminStats = {
  users: {
    total: number;
    today: number;
    yesterday: number;
    week: number;
    prevWeek: number;
    month: number;
    prevMonth: number;
    dailySignups: DailyPoint[];
  };
  premium: {
    activeMembers: number;
    thisMonth: number;
    allTimePurchases: number;
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    failed: number;
    totalRevenue: number;
    monthlyRevenue: number;
    weekRevenue: number;
    lastWeekRevenue: number;
    todayRevenue: number;
    yesterdayRevenue: number;
    byProduct: { productId: string; count: number; revenue: number }[];
    dailyRevenue: DailyPoint[];
  };
  void: {
    total: number;
    complete: number;
    failed: number;
    generating: number;
    pending: number;
    completionRate: number;
    byCategory: { category: string; count: number; complete: number; rate: number }[];
  };
  connections: {
    total: number;
    usersWithConnections: number;
  };
};

export async function getAdminStats(): Promise<AdminStats> {
  /* ── Users ── */
  const accounts = await listStoredAuthAccounts();
  const todayUtc = new Date();
  const startOfTodayUtc = new Date(Date.UTC(
    todayUtc.getUTCFullYear(),
    todayUtc.getUTCMonth(),
    todayUtc.getUTCDate(),
  ));
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfYesterdayUtc = new Date(startOfTodayUtc.getTime() - dayMs);
  const startOfWeekUtc = new Date(startOfTodayUtc.getTime() - 7 * dayMs);
  const startOfPrevWeekUtc = new Date(startOfTodayUtc.getTime() - 14 * dayMs);
  const startOfMonthUtc = new Date(startOfTodayUtc.getTime() - 30 * dayMs);
  const startOfPrevMonthUtc = new Date(startOfTodayUtc.getTime() - 60 * dayMs);

  const userTotal = accounts.length;
  const userToday = accounts.filter((account) => new Date(account.createdAt) >= startOfTodayUtc).length;
  const userYesterday = accounts.filter((account) => {
    const createdAt = new Date(account.createdAt);
    return createdAt >= startOfYesterdayUtc && createdAt < startOfTodayUtc;
  }).length;
  const userWeek = accounts.filter((account) => new Date(account.createdAt) >= startOfWeekUtc).length;
  const userPrevWeek = accounts.filter((account) => {
    const createdAt = new Date(account.createdAt);
    return createdAt >= startOfPrevWeekUtc && createdAt < startOfWeekUtc;
  }).length;
  const userMonth = accounts.filter((account) => new Date(account.createdAt) >= startOfMonthUtc).length;
  const userPrevMonth = accounts.filter((account) => {
    const createdAt = new Date(account.createdAt);
    return createdAt >= startOfPrevMonthUtc && createdAt < startOfMonthUtc;
  }).length;

  const signupCounts = new Map<string, number>();
  for (const account of accounts) {
    const createdAt = new Date(account.createdAt);
    if (createdAt < new Date(startOfTodayUtc.getTime() - 13 * dayMs)) {
      continue;
    }
    const date = account.createdAt.slice(0, 10);
    signupCounts.set(date, (signupCounts.get(date) ?? 0) + 1);
  }
  const dailySignupsRaw = Array.from(signupCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));

  /* ── Orders ── */
  const orderRow = db.prepare(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='paid'    THEN 1 ELSE 0 END) as paid,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='failed'  THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status='paid'    THEN amount ELSE 0 END) as total_revenue,
      SUM(CASE WHEN status='paid' AND paid_at >= date('now','-30 days') THEN amount ELSE 0 END) as monthly_revenue,
      SUM(CASE WHEN status='paid' AND paid_at >= date('now','-7 days') THEN amount ELSE 0 END) as week_revenue,
      SUM(CASE WHEN status='paid' AND paid_at >= date('now','-14 days') AND paid_at < date('now','-7 days') THEN amount ELSE 0 END) as last_week_revenue,
      SUM(CASE WHEN status='paid' AND paid_at >= date('now') THEN amount ELSE 0 END) as today_revenue,
      SUM(CASE WHEN status='paid' AND paid_at >= date('now','-1 day') AND paid_at < date('now') THEN amount ELSE 0 END) as yesterday_revenue
     FROM orders`
  ).get() as {
    total: number; paid: number; pending: number; failed: number;
    total_revenue: number; monthly_revenue: number; week_revenue: number;
    last_week_revenue: number; today_revenue: number; yesterday_revenue: number;
  };

  const byProduct = db.prepare(
    `SELECT product_id, COUNT(*) as count, SUM(amount) as revenue
     FROM orders WHERE status='paid' GROUP BY product_id ORDER BY revenue DESC`
  ).all() as { product_id: string; count: number; revenue: number }[];

  const dailyRevenueRaw = db.prepare(
    `SELECT date(paid_at) as date, SUM(amount) as value
     FROM orders WHERE status='paid' AND paid_at >= date('now','-13 days')
     GROUP BY date(paid_at) ORDER BY date ASC`
  ).all() as DailyPoint[];

  /* ── Void ── */
  const voidRow = db.prepare(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='complete'   THEN 1 ELSE 0 END) as complete,
      SUM(CASE WHEN status='failed'     THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status='generating' THEN 1 ELSE 0 END) as generating,
      SUM(CASE WHEN status='pending'    THEN 1 ELSE 0 END) as pending
     FROM void_analysis_requests`
  ).get() as { total: number; complete: number; failed: number; generating: number; pending: number };

  const voidByCategory = db.prepare(
    `SELECT category, COUNT(*) as count,
      SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) as complete
     FROM void_analysis_requests GROUP BY category ORDER BY count DESC`
  ).all() as { category: string; count: number; complete: number }[];

  /* ── Premium ── */
  const premiumRow = db.prepare(
    `SELECT COUNT(DISTINCT user_id) as active_members,
      SUM(CASE WHEN paid_at >= date('now','-30 days') THEN 1 ELSE 0 END) as this_month,
      COUNT(*) as all_time
     FROM orders WHERE product_id='membership' AND status='paid'`
  ).get() as { active_members: number; this_month: number; all_time: number };

  /* ── Connections ── */
  const connTotal = (db.prepare("SELECT COUNT(*) as c FROM connections").get() as {c:number}).c;
  const connUsers = (db.prepare("SELECT COUNT(DISTINCT owner_user_id) as c FROM connections").get() as {c:number}).c;

  const vt = voidRow.total ?? 0;
  const vc = voidRow.complete ?? 0;

  return {
    users: {
      total: userTotal,
      today: userToday,
      yesterday: userYesterday,
      week: userWeek,
      prevWeek: userPrevWeek,
      month: userMonth,
      prevMonth: userPrevMonth,
      dailySignups: dailySignupsRaw,
    },
    premium: {
      activeMembers: premiumRow.active_members ?? 0,
      thisMonth: premiumRow.this_month ?? 0,
      allTimePurchases: premiumRow.all_time ?? 0,
    },
    orders: {
      total:            orderRow.total           ?? 0,
      paid:             orderRow.paid            ?? 0,
      pending:          orderRow.pending         ?? 0,
      failed:           orderRow.failed          ?? 0,
      totalRevenue:     orderRow.total_revenue   ?? 0,
      monthlyRevenue:   orderRow.monthly_revenue ?? 0,
      weekRevenue:      orderRow.week_revenue    ?? 0,
      lastWeekRevenue:  orderRow.last_week_revenue ?? 0,
      todayRevenue:     orderRow.today_revenue   ?? 0,
      yesterdayRevenue: orderRow.yesterday_revenue ?? 0,
      byProduct: byProduct.map(r => ({ productId: r.product_id, count: r.count, revenue: r.revenue })),
      dailyRevenue: dailyRevenueRaw,
    },
    void: {
      total:          vt,
      complete:       vc,
      failed:         voidRow.failed    ?? 0,
      generating:     voidRow.generating ?? 0,
      pending:        voidRow.pending   ?? 0,
      completionRate: vt > 0 ? Math.round(vc / vt * 100) : 0,
      byCategory: voidByCategory.map(r => ({
        category: r.category,
        count:    r.count,
        complete: r.complete ?? 0,
        rate:     r.count > 0 ? Math.round((r.complete ?? 0) / r.count * 100) : 0,
      })),
    },
    connections: {
      total: connTotal,
      usersWithConnections: connUsers,
    },
  };
}
