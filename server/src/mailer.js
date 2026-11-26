'use strict';
/*
 * E-posta gönderimi. Tüm iletiler önce outbox tablosuna yazılır.
 * SMTP_URL tanımlıysa (ör. smtps://kullanici:sifre@smtp.ornek.com:465) ve
 * "nodemailer" paketi kuruluysa gerçekten gönderilir; değilse geliştirme
 * modunda konsola yazılır.
 */
function createMailer(db, cfg, log = console) {
  let transport = null;
  if (cfg.smtpUrl) {
    try { transport = require('nodemailer').createTransport(cfg.smtpUrl); }
    catch { log.warn('[mail] SMTP_URL var ama nodemailer kurulu değil: npm i nodemailer'); }
  }
  return {
    async send(to, subject, body, now = Date.now()) {
      const id = db.prepare('INSERT INTO outbox(to_addr,subject,body,created_at) VALUES(?,?,?,?)').run(to, subject, body, now).lastInsertRowid;
      if (transport) {
        try { await transport.sendMail({ from: cfg.mailFrom, to, subject, text: body }); db.prepare('UPDATE outbox SET sent=1 WHERE id=?').run(id); }
        catch (e) { log.error('[mail] gönderilemedi', e.message); }
      } else if (!cfg.quiet) {
        log.log(`[mail:dev] -> ${to} | ${subject}\n${body}\n`);
      }
    },
  };
}
module.exports = { createMailer };
