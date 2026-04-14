import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import crypto from "node:crypto";
import Module from "node:module";

process.env.LUNA_DB_PATH = ":memory:";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request, parent, isMain) => {
  if (request === "server-only") {
    return {};
  }

  return originalLoad(request, parent, isMain);
};

let db: typeof import("../server/db").db;
let consumeVoidCredit: typeof import("../server/entitlement-store").consumeVoidCredit;
let getEntitlement: typeof import("../server/entitlement-store").getEntitlement;
let grantFromSku: typeof import("../server/entitlement-store").grantFromSku;
let checkVip: typeof import("../server/entitlement-store").checkVip;
let recordIapReceipt: typeof import("../server/entitlement-store").recordIapReceipt;
let createOrder: typeof import("../server/order-store").createOrder;
let getOrder: typeof import("../server/order-store").getOrder;
let markOrderPaid: typeof import("../server/order-store").markOrderPaid;
let applyLocalRefund: typeof import("../server/refund-service").applyLocalRefund;
let deactivateSubscriptionAccess: typeof import("../server/refund-service").deactivateSubscriptionAccess;
let ANNUAL_REPORT: typeof import("../products").ANNUAL_REPORT;
let VIP_MONTHLY: typeof import("../products").VIP_MONTHLY;
let VOID_PACK_5: typeof import("../products").VOID_PACK_5;

before(async () => {
  ({ db } = await import("../server/db"));
  ({
    consumeVoidCredit,
    getEntitlement,
    grantFromSku,
    checkVip,
    recordIapReceipt,
  } = await import("../server/entitlement-store"));
  ({
    createOrder,
    getOrder,
    markOrderPaid,
  } = await import("../server/order-store"));
  ({
    applyLocalRefund,
    deactivateSubscriptionAccess,
  } = await import("../server/refund-service"));
  ({
    ANNUAL_REPORT,
    VIP_MONTHLY,
    VOID_PACK_5,
  } = await import("../products"));
});

function createUser() {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, phone_number, password_hash, password_salt, created_at, updated_at)
    VALUES (@id, @username, @phoneNumber, 'x', 'y', @now, @now)
  `).run({
    id,
    username: `user_${id}`,
    phoneNumber: `+8210${id.replace(/-/g, "").slice(0, 8)}`,
    now,
  });

  return id;
}

describe("refund flow", () => {
  it("void pack refund only removes unused credits", () => {
    const userId = createUser();
    const order = createOrder(userId, "void_pack_5");

    markOrderPaid(order.id, "tx_void_1", "DEV");
    grantFromSku(userId, VOID_PACK_5, new Date(), undefined, {
      orderId: order.id,
      transactionId: "tx_void_1",
      sourceType: "purchase",
    });

    assert.equal(getEntitlement(userId).voidCredits, 5);
    assert.equal(consumeVoidCredit(userId), true);
    assert.equal(getEntitlement(userId).voidCredits, 4);

    const result = applyLocalRefund({
      userId,
      skuId: VOID_PACK_5,
      source: "dev",
      reason: "test refund",
      orderId: order.id,
      transactionId: "tx_void_1",
    });

    assert.equal(result.refundedVoidCredits, 4);
    assert.equal(getEntitlement(userId).voidCredits, 0);
    assert.equal(getOrder(order.id)?.status, "refunded");
  });

  it("annual report refund revokes entitlement", () => {
    const userId = createUser();
    const order = createOrder(userId, "annual_report");

    markOrderPaid(order.id, "tx_annual_1", "DEV");
    grantFromSku(userId, ANNUAL_REPORT, new Date(), undefined, {
      orderId: order.id,
      transactionId: "tx_annual_1",
      sourceType: "purchase",
    });

    assert.equal(getEntitlement(userId).annualReportOwned, 1);

    applyLocalRefund({
      userId,
      skuId: ANNUAL_REPORT,
      source: "dev",
      reason: "annual refund",
      orderId: order.id,
      transactionId: "tx_annual_1",
    });

    assert.equal(getEntitlement(userId).annualReportOwned, 0);
    assert.equal(getOrder(order.id)?.status, "refunded");
  });

  it("subscription expiry revokes vip and cancels linked order", () => {
    const userId = createUser();
    const order = createOrder(userId, "membership");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    markOrderPaid(order.id, "tx_vip_1", "APPLE_IAP", "orig_vip_1");
    grantFromSku(userId, VIP_MONTHLY, new Date(), expiresAt, {
      orderId: order.id,
      transactionId: "tx_vip_1",
      sourceType: "purchase",
    });
    recordIapReceipt({
      userId,
      platform: "apple",
      skuId: VIP_MONTHLY,
      transactionId: "tx_vip_1",
      originalTransactionId: "orig_vip_1",
      status: "valid",
      expiresDate: expiresAt.toISOString(),
    });

    assert.equal(checkVip(userId), true);

    deactivateSubscriptionAccess({
      userId,
      skuId: VIP_MONTHLY,
      platform: "apple",
      status: "expired",
      reason: "vip expired",
      originalTransactionId: "orig_vip_1",
    });

    assert.equal(checkVip(userId), false);
    assert.equal(getOrder(order.id)?.status, "cancelled");
  });
});