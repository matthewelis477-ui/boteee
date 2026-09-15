import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";

export type NoticeKind =
  | "welcome"
  | "trade_opened"
  | "trade_closed"
  | "stop_hit"
  | "target_hit"
  | "trade_issue";

export async function createUserNotice(opts: {
  userId: string;
  kind: NoticeKind;
  title: string;
  body?: string;
  telegramChatId?: string | null;
  telegramHtml?: string;
}) {
  const notice = await prisma.userNotice.create({
    data: {
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body || "",
    },
  });

  if (opts.telegramChatId && opts.telegramHtml) {
    void sendTelegram(opts.telegramChatId, opts.telegramHtml);
  }

  return notice;
}

export async function notifyWelcome(userId: string, name: string, telegramChatId?: string | null) {
  return createUserNotice({
    userId,
    kind: "welcome",
    title: `Welcome to Botee${name ? `, ${name}` : ""}`,
    body: "Your account is ready. Review today’s signals and set your preferences anytime in Settings.",
    telegramChatId,
    telegramHtml: `<b>Welcome to Botee</b>\nHi ${name || "there"}. Your account is ready. Open the app to see today’s signals.`,
  });
}

export async function notifyTradeOpened(opts: {
  userId: string;
  asset: string;
  side: string;
  qty: number;
  entry: number | null;
  stop: number;
  telegramChatId?: string | null;
  testnet?: boolean;
}) {
  const entry = opts.entry != null ? `~${opts.entry}` : "market";
  return createUserNotice({
    userId: opts.userId,
    kind: "trade_opened",
    title: `Trade opened · ${opts.asset} ${opts.side}`,
    body: `Size ${opts.qty} · Entry ${entry} · Stop ${opts.stop}${opts.testnet ? " · Testnet" : ""}`,
    telegramChatId: opts.telegramChatId,
    telegramHtml: `<b>Trade opened</b>${opts.testnet ? " · Testnet" : ""}\n${opts.asset} ${opts.side}\nSize ${opts.qty}\nEntry ${entry}\nStop ${opts.stop}`,
  });
}

export async function notifyTradeClosed(opts: {
  userId: string;
  asset: string;
  reason: string;
  pnl?: number;
  telegramChatId?: string | null;
  kind?: NoticeKind;
}) {
  const isSl = /sl|stop/i.test(opts.reason);
  const kind = opts.kind || (isSl ? "stop_hit" : "trade_closed");
  const title =
    kind === "stop_hit"
      ? `Stop hit · ${opts.asset}`
      : `Trade closed · ${opts.asset}`;
  const pnlBit = opts.pnl != null && Number.isFinite(opts.pnl) ? ` · PnL ${opts.pnl.toFixed(2)}` : "";
  return createUserNotice({
    userId: opts.userId,
    kind,
    title,
    body: `${opts.reason}${pnlBit}`,
    telegramChatId: opts.telegramChatId,
    telegramHtml: `<b>${kind === "stop_hit" ? "Stop hit" : "Trade closed"}</b>\n${opts.asset}\n${opts.reason}${pnlBit}`,
  });
}
