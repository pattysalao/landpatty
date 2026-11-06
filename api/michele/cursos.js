import { createHash, randomBytes } from "node:crypto";
import { db, firebaseAdmin, requireStaff, send } from "../../lib/firebase.js";

const COURSES = new Set(["Extensão de Cílios", "Lash Lifting", "Brow Lamination", "Design de Sobrancelhas", "Design com Henna"]);
const LEVELS = new Set(["Iniciante", "Já atuo na beleza", "Já trabalho com cílios"]);
const SHIFTS = new Set(["Manhã", "Tarde", "Noite", "A combinar"]);
const field = (value, max=150) => typeof value === "string" ? value.trim().slice(0, max) : "";
function fingerprint(value) {
  return createHash("sha256").update(value + "|" + (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "")).digest("hex").slice(0, 36);
}

export default async function handler(req,res) {
  if (!["GET","POST"].includes(req.method)) return send(res,405,{error:"Método não permitido"});
  if (req.method==="GET") {
    try {
      await requireStaff(req);
      const n = Math.min(100,Math.max(1,Number(req.query?.limit||50)||50));
      const query=db().collection("patty_course_leads").orderBy("createdAt","desc").limit(n);
      const snap=await query.get();
      return send(res,200,{leads:snap.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString()||null}))});
    } catch(e) { return send(res,e.status||500,{error:e.status?e.message:"Falha ao consultar inscrições"}); }
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return send(res,503,{error:"Inscrições temporariamente indisponíveis"});
  const allowed=(process.env.CRM_ALLOWED_ORIGINS ||
    "https://www.pattycentrodebeleza.com.br,https://pattycentrodebeleza.com.br")
    .split(",").map(s=>s.trim()).filter(Boolean);
  if (!allowed.includes(req.headers.origin)) return send(res,403,{error:"Origem não autorizada"});
  if (Number(req.headers["content-length"]||0)>12000) return send(res,413,{error:"Requisição muito grande"});
  try {
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    if (body.website) return send(res,200,{ok:true,ignored:true});
    if (body.privacyAcknowledged!==true) return send(res,400,{error:"Confirme a ciência do aviso de privacidade"});
    const name=field(body.name,120);
    const phone=field(body.phone,24).replace(/\D/g,"");
    const course=field(body.course,60);
    const level=field(body.level,40);
    const shift=field(body.shift,30);
    const note=field(body.note,350);
    if (name.length<2||phone.length<10||phone.length>13||!COURSES.has(course)||
        !LEVELS.has(level)||!SHIFTS.has(shift)) {
      return send(res,400,{error:"Revise seu nome, WhatsApp, curso, experiência e período"});
    }
    const campaign={};
    for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id","gclid","gbraid","wbraid"]) {
      campaign[key]=field(body.campaign?.[key],150);
    }
    const database=db();
    const id="CHL-"+randomBytes(6).toString("hex").toUpperCase();
    const now=Date.now();
    const phoneRateRef=database.collection("patty_course_rate_limits")
      .doc("tel-"+fingerprint(phone)+"-"+Math.floor(now/86400000));
    const phoneRecent=await database.collection("patty_course_leads").where("phone","==",phone).limit(12).get();
    const duplicate=phoneRecent.docs.find(d=>d.data().course===course &&
      ((d.data().createdAt?.toMillis?.()||0)>now-24*3600*1000));
    if(duplicate) return send(res,200,{ok:true,reference:duplicate.id,created:false});
    await database.runTransaction(async tx=>{
      const curr=await tx.get(phoneRateRef);
      if((curr.data()?.count||0)>=4){const err=new Error("Limite de solicitações excedido. Tente novamente amanhã.");err.status=429;throw err;}
      tx.set(phoneRateRef,{count:(curr.data()?.count||0)+1,expiresAt:new Date(now+2*86400000)});
      tx.create(database.collection("patty_course_leads").doc(id),{
        reference:id,name,phone,course,level,shift,note,professional:"Michele Tavares",
        status:"interesse_recebido",source:"site_michele_cursos",campaign,
        marketingOptIn:false,privacyAcknowledged:true,
        privacyNoticeVersion:"2026-11-06",createdAt:firebaseAdmin().firestore.FieldValue.serverTimestamp(),
        updatedAt:firebaseAdmin().firestore.FieldValue.serverTimestamp()
      });
    });
    return send(res,201,{ok:true,reference:id,created:true});
  } catch(e) {
    if(e.status) return send(res,e.status,{error:e.message});
    if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message||""))
      return send(res,429,{error:"Sistema indisponível por limite de uso. Fale diretamente pelo WhatsApp."});
    console.error("Inscrição Michele:",e.message);
    return send(res,500,{error:"Não foi possível registrar seu interesse. Tente pelo WhatsApp."});
  }
}
