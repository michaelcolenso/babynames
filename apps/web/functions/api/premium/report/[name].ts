// GET /api/premium/report/:name
//
// Paid version of a name lookup: bundles the pre-computed classification,
// peak stats, and trajectory-similar names that /api/name/:name doesn't
// return (see CLAUDE.md — classify() runs at ingest time and results are
// stored on the `names` row, so this costs one query, not extra compute).
//
// Gated behind the x402 protocol (https://x402.org, scheme "exact",
// network "base-sepolia") so an HTTP client — human or agent — can pay
// per-request instead of needing an account. This is the only paid route
// on the site; every other endpoint stays free. See specs/transports-v1/http.md
// in https://github.com/coinbase/x402 for the wire format this implements
// by hand (no @x402/* dependency — Cloudflare Pages Functions aren't
// Express/Hono/Next, and the request-side of this protocol is just base64
// JSON headers plus two facilitator POSTs).

import { getNameWithSeries, listRelatedNames } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const X402_VERSION = 1;
const NETWORK = "base-sepolia";
const SCHEME = "exact";
// USDC on Base Sepolia — see typescript/packages/legacy/x402/src/types/shared/evm/config.ts
// (chain 84532) in https://github.com/coinbase/x402.
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PRICE_ATOMIC = "10000"; // $0.01 USDC (6 decimals)
const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, string>;
}

interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
}

interface SettleResponse {
  success: boolean;
  errorReason?: string;
  transaction?: string;
  network?: string;
  payer?: string;
}

function paymentRequired(payTo: string, resource: string): PaymentRequirements {
  return {
    scheme: SCHEME,
    network: NETWORK,
    maxAmountRequired: PRICE_ATOMIC,
    resource,
    description:
      "NobodyNamed premium name report: trend classification, peak stats, and trajectory-similar names in one call.",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_BASE_SEPOLIA,
    extra: { name: "USDC", version: "2" },
  };
}

function paymentRequiredResponse(status: number, error: string, requirements: PaymentRequirements) {
  return Response.json(
    { x402Version: X402_VERSION, error, accepts: [requirements] },
    { status },
  );
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const payTo = ctx.env.X402_PAY_TO;
  if (!payTo) {
    return Response.json(
      {
        error: "x402_not_configured",
        message: "This endpoint accepts x402 payments but no payout wallet is configured yet.",
      },
      { status: 501 },
    );
  }

  const rawName = ctx.params.name;
  if (typeof rawName !== "string" || !rawName) {
    return new Response("missing name", { status: 400 });
  }

  const url = new URL(ctx.request.url);
  const resource = `${url.origin}${url.pathname}`;
  const requirements = paymentRequired(payTo, resource);
  const facilitatorUrl = (ctx.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL).replace(/\/+$/, "");

  const paymentHeader = ctx.request.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return paymentRequiredResponse(402, "X-PAYMENT header is required", requirements);
  }

  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(atob(paymentHeader));
  } catch {
    return paymentRequiredResponse(402, "Invalid or malformed X-PAYMENT header", requirements);
  }

  const facilitatorBody = JSON.stringify({
    x402Version: X402_VERSION,
    paymentPayload,
    paymentRequirements: requirements,
  });

  let verify: VerifyResponse;
  try {
    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: facilitatorBody,
    });
    verify = await verifyRes.json();
  } catch {
    return paymentRequiredResponse(402, "Payment verification failed", requirements);
  }

  if (!verify.isValid) {
    return paymentRequiredResponse(402, verify.invalidReason || "Payment invalid", requirements);
  }

  const lower = decodeURIComponent(rawName).toLowerCase();
  const rows = await getNameWithSeries(ctx.env.DB, lower);
  if (!rows.length) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const report = await Promise.all(
    rows.map(async ({ row, series }) => ({
      name: row.name,
      sex: row.sex,
      status: row.status,
      firstYear: row.first_year,
      lastYear: row.last_year,
      peakYear: row.peak_year,
      peakCount: row.peak_count,
      latestCount: row.latest_count,
      totalCount: row.total_count,
      declinePct: row.decline_pct,
      series: Object.fromEntries(series.map((p) => [p.year, p.count])),
      related: await listRelatedNames(ctx.env.DB, lower, row.sex, row.status, row.peak_year, 6),
    })),
  );

  let settle: SettleResponse;
  try {
    const settleRes = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: facilitatorBody,
    });
    settle = await settleRes.json();
  } catch {
    return paymentRequiredResponse(402, "Payment settlement failed", requirements);
  }

  if (!settle.success) {
    return paymentRequiredResponse(402, settle.errorReason || "Payment settlement failed", requirements);
  }

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.set("X-PAYMENT-RESPONSE", btoa(JSON.stringify(settle)));

  return new Response(JSON.stringify({ name: lower, records: report }), { status: 200, headers });
};
