import { db, firebaseAdmin, requireStaff, send } from "../../lib/firebase.js";

function managerEmails() {
  return (process.env.CRM_MANAGER_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}
async function manager(req) {
  const staff = await requireStaff(req);
  if (!managerEmails().includes((staff.email || "").toLowerCase())) {
    const err = new Error("Somente a administração pode importar ou consultar a base de clientes."); err.status = 403; throw err;
  }
  return staff;
}
const str = (x, n=120) => typeof x === "string" ? x.trim().slice(0,n) : "";
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(v + "T12:00:00Z")) && new Date(v+"T12:00:00Z").toISOString().startsWith(v);
const cents = v => Number.isSafeInteger(v) && Math.abs(v) <= 10000000000 ? v : null;
function normalize(item) {
  const code = str(item.gendoCode,32);
  const name = str(item.name,120);
  const raw = str(item.phone,30).replace(/\D/g,"");
  const phone = raw.length === 10 || raw.length === 11 ? "55"+raw : raw;
  if (!/^\d{1,15}$/.test(code) || name.length < 2 || phone.length < 12 || phone.length > 13) return null;
  return {
    id: "gendo-"+code, gendoCode: code, name, phone,
    email: str(item.email,150).toLowerCase(),
    birthDate: validDate(item.birthDate) ? item.birthDate : null,
    lastVisit: validDate(item.lastVisit) ? item.lastVisit : null,
    visits: Number.isSafeInteger(item.visits) && item.visits >= 0 && item.visits < 1000000 ? item.visits : 0,
    historicalBilledCents: cents(item.historicalBilledCents),
    historicalBalanceCents: cents(item.historicalBalanceCents)
  };
}
export default async function handler(req,res) {
  if (!["GET","POST"].includes(req.method)) return send(res,405,{error:"Método não permitido"});
  try {
    const staff = await manager(req);
    const coll = db().collection("patty_customers");
    if (req.method === "GET") {
      // Direct lookup across the entire historic base, not only the current page.
      if (req.query?.lookup !== undefined) {
        const digits = String(req.query.lookup).replace(/\D/g,"");
        if (!/^\d{1,15}$/.test(digits))
          return send(res,400,{error:"Informe o código Gendo ou telefone válido"});
        let docs;
        if (digits.length <= 8) {
          const doc = await coll.doc("gendo-"+digits).get();
          docs = doc.exists ? [doc] : [];
        } else {
          const phone=digits.length===10||digits.length===11?"55"+digits:digits;
          if (phone.length!==12 && phone.length!==13) return send(res,400,{error:"Telefone com DDD inválido"});
          const snap = await coll.where("phone","==",phone).limit(25).get();
          docs = snap.docs;
        }
        return send(res,200,{customers:docs.map(d=>{
          const x=d.data();return {id:d.id,gendoCode:x.gendoCode,name:x.name,phone:x.phone,visits:x.visits,
            lastVisit:x.lastVisit,historicalBilledCents:x.historicalBilledCents,
            historicalBalanceCents:x.historicalBalanceCents,birthDate:x.birthDate,marketingOptIn:x.marketingOptIn===true};
        }),nextCursor:null,exactLookup:true});
      }
      const term = str(req.query?.q,80).toLowerCase();
      const limit = 100;
      let query = coll.orderBy("gendoCode").limit(limit);
      if (req.query?.cursor) {
        const cursor = await coll.doc(str(req.query.cursor,65)).get();
        if (!cursor.exists) return send(res,400,{error:"Página inválida"});
        query = query.startAfter(cursor);
      }
      const snap = await query.get();
      const rows = snap.docs.map(d => {
        const x = d.data();
        return { id:d.id, gendoCode:x.gendoCode, name:x.name,phone:x.phone,visits:x.visits,lastVisit:x.lastVisit,
          historicalBilledCents:x.historicalBilledCents,historicalBalanceCents:x.historicalBalanceCents,
          birthDate:x.birthDate, marketingOptIn:x.marketingOptIn===true };
      }).filter(x => !term || [x.name,x.phone,x.gendoCode].some(v => String(v||"").toLowerCase().includes(term)));
      return send(res,200,{customers:rows,nextCursor:snap.size===limit?snap.docs[snap.docs.length-1].id:null, note:"Busca apenas na página carregada"});
    }
    if (Number(req.headers["content-length"]||0) > 85000) return send(res,413,{error:"Lote muito grande"});
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body||{};
    const records = body.records;
    const dryRun = body.dryRun !== false;
    if (!Array.isArray(records) || !records.length || records.length > 50)
      return send(res,400,{error:"Envie de 1 a 50 registros por lote"});
    const seenCodes=new Set(),seenPhones=new Set();
    const validated=[];let invalid=0,duplicatesInFile=0;
    for(const raw of records) {
      const item=normalize(raw||{});
      if (!item) {invalid++;continue;}
      if(seenCodes.has(item.id)||seenPhones.has(item.phone)) {duplicatesInFile++;continue;}
      seenCodes.add(item.id);seenPhones.add(item.phone);validated.push(item);
    }
    const result={dryRun,received:records.length,valid:validated.length,invalid,duplicatesInFile,existing:0,created:0,conflicts:0};
    // Idempotente: nunca sobrescrever clientes cadastrados. Conferir ID de origem e telefone.
    for(const item of validated) {
      const [old, phoneMatch] = await Promise.all([
        coll.doc(item.id).get(),coll.where("phone","==",item.phone).limit(1).get()
      ]);
      if(old.exists || !phoneMatch.empty) {result.existing++;continue;}
      if(dryRun){result.created++;continue;}
      try {
        await coll.doc(item.id).create({
          ...item, source:"gendo", marketingOptIn:false, consentRecordedAt:null,
          importedAt:firebaseAdmin().firestore.FieldValue.serverTimestamp(),
          importedBy:staff.email, legacyTotalsNotCurrentRevenue:true
        });
        result.created++;
      } catch(e) {
        if(e.code===6||e.code==="already-exists") result.existing++;
        else { console.error("Erro importando cadastro Gendo:",e.message); result.conflicts++; }
      }
    }
    return send(res,200,result);
  } catch(e) {
    if(e.status)return send(res,e.status,{error:e.message});
    console.error("Erro CRM clientes:",e.message);
    return send(res,500,{error:"Falha ao consultar ou importar clientes"});
  }
}
