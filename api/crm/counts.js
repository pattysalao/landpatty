import { db, requireStaff, send } from "../../lib/firebase.js";
const managers=()=>(process.env.CRM_MANAGER_EMAILS||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
export default async function handler(req,res){
 if(req.method!=="GET")return send(res,405,{error:"Método não permitido"});
 try{
  const staff=await requireStaff(req);
  const isManager=managers().includes((staff.email||"").toLowerCase());
  const dbi=db();
  const [leads,customers]=await Promise.all([
    dbi.collection("patty_leads").count().get(),
    isManager?dbi.collection("patty_customers").count().get():Promise.resolve(null)
  ]);
  return send(res,200,{
    leadsTotal:leads.data().count,
    customersTotal:customers?customers.data().count:null,
    customersVisible:isManager,
    countType:"Firestore aggregation",
    timestamp:new Date().toISOString()
  });
 }catch(e){
  if(e.status)return send(res,e.status,{error:e.message});
  console.error("CRM count error:",e.message);
  return send(res,500,{error:"Não foi possível contar os registros"});
 }
}
