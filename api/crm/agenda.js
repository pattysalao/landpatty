import { db, requireStaff, send } from "../../lib/firebase.js";
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v||"") && !Number.isNaN(Date.parse(v+"T12:00:00Z")) && new Date(v+"T12:00:00Z").toISOString().startsWith(v);
export default async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:"Método não permitido"});
  try {
    await requireStaff(req);
    const date=String(req.query?.date||"");
    if(!validDate(date))return send(res,400,{error:"Informe uma data válida"});
    // Consultar somente o dia selecionado: evita carregar a base histórica toda.
    const [leads,appointments]=await Promise.all([
      db().collection("patty_leads").where("appointmentDate","==",date).limit(251).get(),
      db().collection("patty_appointments").where("date","==",date).limit(251).get()
    ]);
    const legacy=leads.docs.slice(0,250).map(d=>{
      const v=d.data();
      return {id:d.id,name:v.name||"",service:v.service||"A definir",
        professional:v.professional||"Não atribuído",appointmentTime:v.appointmentTime||"",
        durationMin:60,status:v.status||"novo",recordType:"lead",
        source:"leads",isTest:v.isTest===true};
    }).filter(v=>!v.isTest&&!["perdido","cancelado"].includes(v.status));
    const current=appointments.docs.slice(0,250).map(d=>{
      const v=d.data();
      return {id:d.id,name:v.name||"",service:v.service||"A definir",
        professional:v.professional||"Não atribuído",appointmentTime:v.appointmentTime||"",
        durationMin:v.durationMin||60,status:v.status||"agendado",
        recordType:v.recordType||"appointment",source:"crm",notes:v.notes||""};
    }).filter(v=>v.status!=="cancelado");
    const rows=legacy.concat(current).sort((a,b)=>(a.appointmentTime||"").localeCompare(b.appointmentTime||""));
    return send(res,200,{date,appointments:rows,partial:leads.size>250||appointments.size>250,
      disclaimer:"Agenda piloto do CRM. Agendamentos do Gendo ainda não são sincronizados."});
  }catch(e){
    if(e.status)return send(res,e.status,{error:e.message});
    if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message||""))return send(res,429,{error:"Cota gratuita do Firestore esgotada. Consulte o limite no Firebase ou tente após a renovação."});
    console.error("Erro agenda CRM:",e.message);
    return send(res,500,{error:"Falha ao carregar agenda"});
  }
}
