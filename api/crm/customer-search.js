import { db, requireStaff, firebaseAdmin, send } from "../../lib/firebase.js";

const MAX=16;
const clean=(s,n=120)=>typeof s==="string"?s.trim().slice(0,n):"";
const fold=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const prefixTokens=name=>{
  const words=fold(name).split(" ").filter(Boolean), full=fold(name);
  const values=new Set();
  for(const word of [full,...words]){
    for(let n=2;n<=Math.min(word.length,60);n++)values.add(word.slice(0,n));
  }
  return [...values].slice(0,240);
};
const responseRow=d=>{const v=d.data();return {id:d.id,name:v.name||"",phone:v.phone||"",gendoCode:v.gendoCode||"",lastVisit:v.lastVisit||null,visits:v.visits||0,marketingOptIn:v.marketingOptIn===true};};
const allowedManager=email=>(process.env.CRM_MANAGER_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).includes(String(email||"").toLowerCase());
export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method))return send(res,405,{error:"Método não permitido"});
  try{
    const staff=await requireStaff(req);
    const coll=db().collection("patty_customers");
    if(req.method==="GET"){
      const query=clean(req.query?.q,75), q=fold(query);
      if(q.length<2)return send(res,200,{customers:[],minimum:2,indexed:false});
      if(q.length>60)return send(res,400,{error:"Busca muito longa"});
      const found=new Map();
      const indexed=await coll.where("searchPrefixes","array-contains",q).limit(MAX).get();
      for(const d of indexed.docs)found.set(d.id,d);
      // Fallback for historical records not yet indexed. Avoids scanning 11k records on each keypress.
      if(found.size<MAX){
        const variants=[query,query.toLocaleLowerCase("pt-BR"),query.toLocaleUpperCase("pt-BR"),
          query.charAt(0).toLocaleUpperCase("pt-BR")+query.slice(1).toLocaleLowerCase("pt-BR")];
        for(const term of [...new Set(variants)]){
          const snap=await coll.orderBy("name").startAt(term).endAt(term+"\uf8ff").limit(MAX).get();
          for(const d of snap.docs)if(fold(d.data().name).split(" ").some(w=>w.startsWith(q))||fold(d.data().name).startsWith(q))found.set(d.id,d);
          if(found.size>=MAX)break;
        }
      }
      return send(res,200,{customers:[...found.values()].slice(0,MAX).map(responseRow),
        indexed:!indexed.empty,indexComplete:false,note:"A pesquisa completa por qualquer parte do nome requer a indexação inicial da base histórica."});
    }
    if(!allowedManager(staff.email))return send(res,403,{error:"Indexação reservada à administração"});
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    if(body.action!=="index")return send(res,400,{error:"Ação inválida"});
    const cursor=clean(body.cursor,80);
    let q=coll.orderBy(firebaseAdmin().firestore.FieldPath.documentId()).limit(101);
    if(cursor)q=q.startAfter(cursor);
    const snap=await q.get(), selected=snap.docs.slice(0,100);
    const batch=db().batch();let updated=0;
    for(const d of selected){
      const prefixes=prefixTokens(d.data().name||"");
      if(prefixes.length){batch.update(d.ref,{searchPrefixes:prefixes});updated++;}
    }
    if(updated)await batch.commit();
    const done=snap.size<=100;
    return send(res,200,{ok:true,updated,processed:selected.length,done,cursor:done?null:selected.at(-1)?.id||null});
  }catch(e){
    if(e.status)return send(res,e.status,{error:e.message});
    if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/.test(e.message||""))return send(res,429,{error:"Cota de leitura/gravação Firestore atingida; retome a indexação quando liberar."});
    console.error("Busca de clientes Patty:",e.message);
    return send(res,500,{error:"Busca de clientes indisponível"});
  }
}
