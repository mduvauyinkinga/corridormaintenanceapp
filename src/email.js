/**
 * email.js ------------------------------------------------------------------
 * Sends password-reset emails via SMTP when configured.
 *
 * In development (no SMTP_HOST set) the reset link is logged to the console
 * instead, so the flow can be tested end-to-end without a mail server.
 *
 * Production: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * and FRONTEND_URL in server/.env (or your hosting provider's env vars).
 */
import nodemailer from "nodemailer";
import config from "./config.js";

let transporter = null;

/** Lazily build the SMTP transporter only when SMTP_HOST is configured. */
function getTransporter() {
  if (!transporter && config.smtpHost) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure === "true",
      auth: config.smtpUser && config.smtpPass
        ? { user: config.smtpUser, pass: config.smtpPass }
        : undefined,
    });
  }
  return transporter;
}

/**
 * Send a password-reset email (or log the link in dev mode).
 * @returns {Promise<{ devMode: boolean, message: string }>}
 */
export async function sendPasswordResetEmail(to, resetUrl) {
  const transport = getTransporter();
  if (!transport) {
    console.log("\n" + "=".repeat(64));
    console.log("[PASSWORD RESET] SMTP not configured — reset link (dev only):");
    console.log(`  ${resetUrl}`);
    console.log("=".repeat(64) + "\n");
    return { devMode: true, message: "Reset link logged to console" };
  }

  await transport.sendMail({
    from: `"Corridor Hill Residence" <${config.smtpFrom || config.smtpUser}>`,
    to,
    subject: "Reset your Corridor Hill password",
    text: `You requested a password reset. Click this link to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
  });
  return { devMode: false, message: "Reset email sent" };
}

/** Quick smoke test: send a Mailtrap test email. */
export async function sendTestEmail(to) {
  const transport = getTransporter();
  if (!transport) {
    throw new Error(
      "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS (and SMTP_PORT)."
    );
  }
  const info = await transport.sendMail({
    from: `"Corridor Maintenance" <${config.smtpFrom || config.smtpUser}>`,
    to,
    subject: "Mailtrap connection test",
    text: "This is a test e-mail message from the Corridor Maintenance API.",
  });
  console.log("Message sent: %s", info.messageId);
  return info;
}
