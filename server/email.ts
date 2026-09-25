import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!resend) {
    // No API key configured — log instead of failing, so local dev keeps working.
    console.log(`[email] RESEND_API_KEY not set. Reset link for ${to}: ${resetUrl}`);
    return;
  }
  await resend.emails.send({
    from: "PickleTab <onboarding@resend.dev>",
    to,
    subject: "Reset your PickleTab password",
    html: `
      <p>Someone requested a password reset for your PickleTab account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  });
}
