import { db, requireStaff, send } from "../../lib/firebase.js";
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v||"") && !Number.isNaN(Date.parse(v+"T12:00:00Z")) && new Date(v+"T12:00:00Z").toISOString().startsWith(v);
export default async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:"Método não permitido"});
  try {
    await requireStaff(req);
    const date=String(req.query?.date||"");
    if(!validDate(date))return send(res,400,{error:"Informe uma data válida"});
    const snap=await db().collection("patty_leads").where("appointmentDate","==",date).limit(501).get();
    const slots=snap.docs.slice(0,500).map(d=>{
      const v=d.data();
      return {id:d.id,name:v.name||"",service:v.service||"A definir",
        professional:v.professional||"Não atribuído",appointmentTime:v.appointmentTime||"",
        status:v.status||"novo",isTest:v.isTest===true};
    }).filter(v=>!v.isTest&&v.status!=="perdido");
    return send(res,200,{date,appointments:slots,partial:snap.size>500,
      disclaimer:"Agenda piloto baseada nos agendamentos registrados no CRM. Não está sincronizada ao Gendo."});
  }catch(e){
    if(e.status)return send(res,e.status,{error:e.message});
    console.error("Erro agenda CRM:",e.message);
    return send(res,500,{error:"Falha ao carregar agenda"});
  }
}
