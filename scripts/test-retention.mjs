import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const records=new Map();let writes=0;
const ref=(collection,id)=>({id,collection,get:async()=>snapshot(collection,id)});
const snapshot=(collection,id)=>({id,exists:records.has(collection+'/'+id),data:()=>records.get(collection+'/'+id)});
const dbi={collection:name=>({doc:id=>ref(name,id)}),runTransaction:async callback=>callback({
 get:async r=>snapshot(r.collection,r.id),
 create:(r,data)=>{writes++;records.set(r.collection+'/'+r.id,data)},
 update:(r,data)=>{writes++;records.set(r.collection+'/'+r.id,{...records.get(r.collection+'/'+r.id),...data})}
})};
const code=readFileSync('api/crm/operations.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
const context=vm.createContext({db:()=>dbi,requireStaff:async()=>({email:'manager@example.test'}),firebaseAdmin:()=>({firestore:{FieldValue:{serverTimestamp:()=>123}}}),send:(_,status,body)=>({status,body}),createHash,console,process:{env:{CRM_MANAGER_EMAILS:'manager@example.test'}}});
vm.runInContext(code,context);
async function call(body){context.request={method:'POST',body};return vm.runInContext('handler(request,{})',context)}
records.set('patty_customers/gendo-1',{phone:'5548999999999',marketingOptIn:true});
const body={action:'marketing_prepare',customerCode:'1',phone:'5548999999999',customerName:'Teste',kind:'sumidos',marketingOptIn:true};
const prepared=await call(body);assert.equal(prepared.status,200);
const id=prepared.body.id;
assert.equal((await call({action:'mark_recovered',id,realizedCents:12000})).status,200);
const before=writes;await call(body);assert.equal(writes,before);
assert.equal(records.get('patty_recovery_events/'+id).status,'recovered');
assert.equal(records.get('patty_recovery_events/'+id).realizedCents,12000);
assert.equal((await call({action:'mark_recovered',id,realizedCents:99000})).status,409);
assert.equal((await call({action:'waitlist',clientName:'Teste',service:'Corte',date:'2026-02-31'})).status,400);
assert.equal((await call({...body,marketingOptIn:false})).status,403);
console.log('Retention regression passed: prepare preserves recovered outcome, repeated recovery rejected, impossible date and missing consent rejected.');
