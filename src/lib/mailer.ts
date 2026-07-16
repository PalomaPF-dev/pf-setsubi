/**
 * メール送信抽象。
 * - クラウド版: Resend（REST API 直叩き）
 * - オンプレ版: 社内 SMTP（nodemailer、遅延 import — クラウドではロードされない）
 * 選択は MAIL_DRIVER 明示 > RESEND_API_KEY > SMTP_HOST。どちらも無ければ null（送信スキップ）。
 */

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  /** 省略時はドライバの既定（resend: 呼び出し側が必ず渡す想定 / smtp: MAIL_FROM） */
  from?: string;
  /** 省略時は env MAIL_REPLY_TO（設定時のみ）を既定として使用 */
  replyTo?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

type DriverName = "resend" | "smtp" | null;

function resolveDriver(): DriverName {
  const explicit = process.env.MAIL_DRIVER;
  if (explicit === "resend") return process.env.RESEND_API_KEY ? "resend" : null;
  if (explicit === "smtp") return process.env.SMTP_HOST ? "smtp" : null;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

export function isMailConfigured(): boolean {
  return resolveDriver() !== null;
}

/** 既定の Reply-To（env MAIL_REPLY_TO。trim して空なら未設定扱い） */
function defaultReplyTo(): string | undefined {
  const v = process.env.MAIL_REPLY_TO?.trim();
  return v || undefined;
}

const resendDriver: Mailer = {
  async send(msg) {
    const replyTo = msg.replyTo ?? defaultReplyTo();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: msg.from ?? process.env.MAIL_FROM ?? "onboarding@resend.dev",
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}: ${body.slice(0, 300)}`);
    }
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
let smtpTransport: any = null;

const smtpDriver: Mailer = {
  async send(msg) {
    if (!smtpTransport) {
      const nodemailer = (await import("nodemailer")).default;
      smtpTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: process.env.SMTP_SECURE === "1",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    const replyTo = msg.replyTo ?? defaultReplyTo();
    await smtpTransport.sendMail({
      from: msg.from ?? process.env.MAIL_FROM,
      to: msg.to.join(", "),
      subject: msg.subject,
      text: msg.text,
      ...(replyTo ? { replyTo } : {}),
    });
  },
};

export function getMailer(): Mailer | null {
  const driver = resolveDriver();
  if (driver === "resend") return resendDriver;
  if (driver === "smtp") return smtpDriver;
  return null;
}
