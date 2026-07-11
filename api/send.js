// Standalone bulk mailer for Yhuu — completely separate from the main
// app repo. Deploy this as its own Vercel project. Sends each
// recipient their own isolated email via Resend's batch endpoint (not
// a shared BCC), so nobody sees anyone else's address and it won't
// trip spam filters the way a personal Gmail blast does.
//
// Protected by ADMIN_SECRET so randoms who find the URL can't send
// email through your Resend account.

const BATCH_SIZE = 100; // Resend's batch endpoint limit per request

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { recipients, subject, html, adminSecret, fromName, fromEmail } = req.body || {};

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "recipients must be a non-empty array of emails" });
  }
  if (!subject || !html) {
    return res.status(400).json({ error: "Missing subject or html" });
  }

  const from = `${fromName || "Yhuu"} <${fromEmail || "new@yhuu.life"}>`;
  const batches = chunk(recipients, BATCH_SIZE);
  const results = [];

  for (const batch of batches) {
    const payload = batch.map((to) => ({ from, to, subject, html }));

    const resendRes = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await resendRes.json();
    results.push({
      batchSize: batch.length,
      ok: resendRes.ok,
      ...(resendRes.ok ? { data: body } : { error: body }),
    });
  }

  const allOk = results.every((r) => r.ok);
  return res.status(allOk ? 200 : 207).json({
    success: allOk,
    sent: recipients.length,
    results,
  });
}
