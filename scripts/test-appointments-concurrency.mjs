import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Local in-memory Firestore model: no access to production or external credentials.
const data=new Map(),guards=new Map(),services=new Map();
const ref=(collection,id)=>({type:"doc",collection,id});
const contents=r=>(r.collection==="patty_appointments"?data:r.collection==="patty_module_servicos"?services:guards);
const document=r=>({id:r.id,exists:contents(r).has(r.id),data:()=>contents(r).get(r.id)});
const collection=name=>({
  doc(id){
    const r=ref(name,id);
    return {...r,get:async()=>document(r),update:async patch=>{
      if(!contents(r).has(id))throw Error("Missing document");
      contents(r).set(id,{...contents(r).get(id),...patch});
    }};
  },
  where(field,op,value){
    assert.equal(op,"==");
    return {type:"query",collection:name,field,value,limit(n){return {...this,max:n};}};
  }
});
let serial=Promise.resolve(),transactions=0,guardReads=0;
const database={collection,runTransaction(callback){
  // Serialize commits per shared database. The test starts independent HTTP
  // requests concurrently to detect non-transactional check-then-create flows.
  const current=serial.then(async()=>{
    transactions++;
    const staged=[];
    const tx={
      get:async target=>{
        await Promise.resolve();
        if(target.type==="doc"){
          if(target.collection==="patty_appointment_locks")guardReads++;
          return document(target);
        }
        const rows=[...contents(target).entries()]
          .filter(([,value])=>value[target.field]===target.value)
          .slice(0,target.max??Infinity)
          .map(([id,value])=>({id,data:()=>value}));
        return {docs:rows,size:rows.length};
      },
      create:(r,value)=>staged.push({method:"create",r,value}),
      set:(r,value)=>staged.push({method:"set",r,value})
    };
    const result=await callback(tx);
    for(const write of staged){
      const table=contents(write.r);
      if(write.method==="create"&&table.has(write.r.id))throw Error("Document already exists");
      table.set(write.r.id,write.method==="set"?{...table.get(write.r.id),...write.value}:write.value);
    }
    return result;
  });
  serial=current.catch(()=>{});
  return current;
}};
const source=readFileSync("api/crm/appointments.js","utf8")
  .replace(/^import .*;\n/gm,"")
  .replace("export default async function handler","async function handler");
const context=vm.createContext({
  db:()=>database,createHash,console,
  requireStaff:async()=>({email:"staff@example.test"}),
  firebaseAdmin:()=>({firestore:{FieldValue:{
    serverTimestamp:()=>123,
    arrayUnion:item=>[item]
  }}}),
  send:(_res,status,body)=>({status,body})
});
vm.runInContext(source,context);
const handler=vm.runInContext("handler",context);
const call=(method,body,query)=>handler({method,body,query},{});
const base={name:"Cliente Teste",service:"Corte",professional:"Patty",date:"2026-11-05",
  appointmentTime:"09:00",durationMin:60,priceCents:10000};
const results=await Promise.all([
  call("POST",base),
  call("POST",{...base,name:"Cliente Simultanea"})
]);
assert.deepEqual(results.map(x=>x.status).sort(),[201,409],"Only one simultaneous request should book the slot");
assert.equal(data.size,1);
assert.equal(guards.size,1);
assert.ok(transactions>=2&&guardReads>=2,"Every booking must read the shared transaction guard");
assert.equal((await call("POST",{...base,appointmentTime:"09:30"})).status,409,"Overlapping start rejected");
assert.equal((await call("POST",{...base,appointmentTime:"10:00"})).status,201,"Adjacent time accepted");
assert.equal((await call("POST",{...base,professional:"Allegra",appointmentTime:"09:30"})).status,201,"Different professional has a separate calendar");
const original=results.find(x=>x.status===201).body.id;
assert.equal((await call("PATCH",{id:original,status:"cancelado"})).status,200);
assert.equal((await call("POST",base)).status,201,"Cancelled appointment permits rebooking");
const block={...base,professional:"Benedita",recordType:"block",allDay:true,
  appointmentTime:"00:00",durationMin:1440};
const blocked=await call("POST",block);
assert.equal(blocked.status,201);
assert.equal((await call("POST",{...base,professional:"Benedita",appointmentTime:"23:30",durationMin:30})).status,409,
  "All-day block holds the entire day");
assert.equal((await call("POST",{...base,professional:"Benedita",date:"2026-11-06",appointmentTime:"00:00",durationMin:30})).status,201,
  "Next day starts with a free slot");
assert.equal((await call("PATCH",{id:blocked.body.id,status:"liberado"})).status,200);
assert.equal((await call("POST",{...base,professional:"Benedita",appointmentTime:"09:00"})).status,201,
  "Released all-day block stops occupying time");
assert.equal((await call("POST",{...base,date:"2026-02-31"})).status,400,
  "Impossible dates are rejected");
services.set("catalog-service-01",{name:"Mechas",active:true,durationMin:60,priceCents:25000});
services.set("catalog-service-02",{name:"Mechas",active:false,durationMin:90,priceCents:30000});
const exact={...base,name:"Outra Cliente",service:"Mechas",serviceId:"catalog-service-01",
  professional:"Chele",appointmentTime:"11:00"};
const exactSaved=await call("POST",exact);
assert.equal(exactSaved.status,201,"Valid catalog service ID must be accepted");
assert.equal(data.get(exactSaved.body.id).serviceId,"catalog-service-01","Exact catalog identity must persist");
assert.equal((await call("POST",{...exact,service:"Corte",appointmentTime:"13:00"})).status,409,
  "Service ID and name mismatch must be rejected");
assert.equal((await call("POST",{...exact,serviceId:"catalog-service-02",appointmentTime:"13:00"})).status,409,
  "Inactive services must be rejected");
assert.equal((await call("POST",{...exact,serviceId:"invalid!",appointmentTime:"13:00"})).status,400,
  "Invalid service IDs must be rejected");
console.log("Appointment regression passed: simultaneous booking, overlap, adjacent slots, distinct staff, cancellation, blocks, catalog identity and dates.");
