// E-posta: tüm iletiler outbox tablosuna yazılır; RESEND_API_KEY tanımlıysa Resend HTTP API ile gönderilir
// (Node ve Supabase Edge'de çalışır). Tanımlı değilse "yapılandırılmadı" kabul edilir.
export function createMailer(db, cfg, log = console) {
  return {
    configured: !!cfg.resendKey,
    async send(to, subject, body, now = Date.now()) {
      const [row] = await db.q('INSERT INTO slot.outbox(to_addr,subject,body,created_at) VALUES($1,$2,$3,$4) RETURNING id', [to, subject, body, now]);
      if (!cfg.resendKey) { if (!cfg.quiet) log.log(`[mail:dev] -> ${to} | ${subject}\n${body}`); return false; }
      try {
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: cfg.mailFrom, to: [to], subject, text: body }) });
        if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
        await db.q('UPDATE slot.outbox SET sent=TRUE WHERE id=$1', [row.id]); return true;
      } catch (e) { log.error('[mail] gönderilemedi', e.message); return false; }
    },
  };
}
