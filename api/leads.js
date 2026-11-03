import { createHmac } from "node:crypto";
import { db, firebaseAdmin, send } from "../lib/firebase.js";

const services = new Set([
  "Cabelos e Cachos", "Nail Design", "Sobrancelhas e Micropigmentação",
  "Estética", "Cílios", "Maquiagem", "Depilação", "Massoterapia e Terapias"
]);

function onlyString(v, length = 150) {
  return typeof v === "string" ? v.trim().slice(0, length) : "";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Não mantemos IP nem telefone em claro nos documentos de controle antispam.
function hashIdentifier(value) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).private_key;
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 40);
}

function rateLimitBuckets(req, phone, now, database) {
  const fifteenMinutes = 15 * 60 * 1000;
  const day = 24 * 60 * 60 * 1000;
  const collection = database.collection("patty_capture_rate_limits");
  const policies = [
    { prefix: "phone15", value: phone, interval: fifteenMinutes, max: 3 },
    { prefix: "phoneDay", value: phone, interval: day, max: 12 }
  ];
  // Header de IP atribuído pela infraestrutura Vercel (não pelo cliente).
  const ip = onlyString(req.headers["x-vercel-forwarded-for"], 80).split(",")[0].trim();
  if (ip) {
    policies.push({ prefix: "ip15", value: ip, interval: fifteenMinutes, max: 8 });
    policies.push({ prefix: "ipDay", value: ip, interval: day, max: 40 });
  }
  return policies.map(policy => ({
    ref: collection.doc(policy.prefix + "-" + hashIdentifier(policy.value) +
      "-" + String(Math.floor(now / policy.interval))),
    max: policy.max,
    expiration: new Date(now + policy.interval * 2)
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido" });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    return send(res, 503, { error: "Captação CRM ainda não configurada" });
  const allowed = (process.env.CRM_ALLOWED_ORIGINS ||
    "https://www.pattycentrodebeleza.com.br,https://pattycentrodebeleza.com.br")
    .split(",").map(x => x.trim()).filter(Boolean);
  if (!allowed.includes(req.headers.origin))
    return send(res, 403, { error: "Origem não permitida" });
  if (Number(req.headers["content-length"] || 0) > 12000)
    return send(res, 413, { error: "Requisição muito grande" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (body.website) return send(res, 200, { ok: true }); // honeypot
    if (body.privacyAcknowledged !== true)
      return send(res, 400, { error: "Confirme a ciência do aviso de privacidade" });

    const name = onlyString(body.name, 120);
    const phone = onlyString(body.phone, 24).replace(/\D/g, "");
    const service = onlyString(body.service, 100);
    const reference = onlyString(body.reference, 30);
    const source = body.source === "botao_servico" ? "botao_servico" : "formulario_site";
    // Preferência solicitada no site. NÃO equivale a horário confirmado na agenda.
    const requestedDate=onlyString(body.requestedDate,10);
    const requestedTime=onlyString(body.requestedTime,5);
    if((requestedDate&&!requestedTime)||(!requestedDate&&requestedTime))
      return send(res,400,{error:"Informe data e horário juntos ou deixe ambos vazios"});
    if(requestedDate){
      const validDate=/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)&&
        !Number.isNaN(Date.parse(requestedDate+"T12:00:00Z"))&&
        new Date(requestedDate+"T12:00:00Z").toISOString().startsWith(requestedDate);
      const validTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime);
      const todaySP=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"})
        .formatToParts(new Date()).reduce((acc,x)=>{if(x.type!=="literal")acc[x.type]=x.value;return acc},{});
      const today=todaySP.year+"-"+todaySP.month+"-"+todaySP.day;
      const max=new Date(Date.parse(today+"T12:00:00Z")+90*86400000).toISOString().slice(0,10);
      if(!validDate||!validTime||requestedDate<today||requestedDate>max)
        return send(res,400,{error:"Selecione dia futuro (até 90 dias) e horário válido"});
    }
    if (name.length < 2 || phone.length < 10 || phone.length > 13 ||
        !services.has(service) || !/^PTY-[A-Z0-9]{10,16}$/.test(reference))
      return send(res, 400, { error: "Dados do agendamento inválidos" });

    const campaign = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_id",
                        "utm_content", "utm_term", "gclid", "gbraid", "wbraid"])
      campaign[key] = onlyString(body.campaign?.[key], 150);

    const database = db();
    const now = Date.now();
    const leadRef = database.collection("patty_leads").doc(reference);
    const buckets = rateLimitBuckets(req, phone, now, database);
    const data = {
      reference, name, phone, service, campaign,
      source, status: "novo", revenueCents: null,
      appointmentDate: null,appointmentTime:null,
      requestedDate:requestedDate||null,requestedTime:requestedTime||null,
      bookingRequestStatus:requestedDate?"pendente":"sem_preferencia",
      marketingOptIn:false,notes:"",
      createdAt: firebaseAdmin().firestore.FieldValue.serverTimestamp(),
      updatedAt: firebaseAdmin().firestore.FieldValue.serverTimestamp(),
      privacyNoticeVersion: "2026-10-19",
      history: [{ status: "novo", at: new Date(now), by: "site" }]
    };

    const created = await database.runTransaction(async tx => {
      // A mesma referência nunca é salva duas vezes, mesmo com envios simultâneos.
      const existing = await tx.get(leadRef);
      if (existing.exists) return false;

      // Todas as leituras vêm antes das gravações, conforme exige o Firestore.
      const snapshots = await Promise.all(buckets.map(item => tx.get(item.ref)));
      for (let i = 0; i < buckets.length; i++) {
        if ((snapshots[i].data()?.count || 0) >= buckets[i].max)
          throw httpError(429, "Muitas solicitações. Aguarde alguns minutos ou fale pelo WhatsApp.");
      }
      for (let i = 0; i < buckets.length; i++) {
        tx.set(buckets[i].ref, {
          count: (snapshots[i].data()?.count || 0) + 1,
          expiresAt: buckets[i].expiration
        });
      }
      tx.create(leadRef, data);
      return true;
    });

    return send(res, created ? 201 : 200, { ok: true, reference,created });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    if(err.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(err.message||""))
      return send(res,429,{error:"Cota gratuita do CRM esgotada no momento. Sua solicitação não foi confirmada; continue pelo WhatsApp."});
    console.error("Erro CRM leads:", err.message);
    return send(res, 500, { error: "Não foi possível registrar o contato" });
  }
}
