import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const records=new Map();
for(let i=0;i<105;i++){
 const id="gendo-"+String(i+1).padStart(4,"0");
 records.set(id,{name:"Cliente Teste "+String(i+1).padStart(4,"0")});
}
let writes=0,commits=0,failNextCommit=true;
const database={
 collection(name){
  assert.equal(name,"patty_customers");
  return {
   orderBy(_field){
    return {
     size:101,cursor:null,
     limit(n){this.size=n;return this;},
     startAfter(v){this.cursor=v;return this;},
     async get(){
      const ids=[...records.keys()].sort().filter(id=>!this.cursor||id>this.cursor).slice(0,this.size);
      return {size:ids.length,docs:ids.map(id=>({
       id,ref:{id},data:()=>records.get(id)
      }))};
     }
    };
   }
  };
 },
 batch(){
  const pending=[];
  return {
   update(ref,value){pending.push({ref,value});},
   async commit(){
    commits++;
    if(failNextCommit){
     failNextCommit=false;
     throw Object.assign(new Error("Quota exceeded"),{code:8});
    }
    for(const {ref,value} of pending){
      writes++;
      records.set(ref.id,{...records.get(ref.id),...value});
    }
   }
  };
 }
};
const source=readFileSync("api/crm/customer-search.js","utf8")
  .replace(/^import .*;\n/gm,"")
  .replace("export default async function handler","async function handler");
const settings={env:{CRM_MANAGER_EMAILS:"admin@example.test"}};
const context=vm.createContext({
 db:()=>database,
 requireStaff:async()=>({email:"admin@example.test"}),
 firebaseAdmin:()=>({firestore:{FieldPath:{documentId:()=> "__name__"}}}),
 send:(_res,status,body)=>({status,body}),
 process:settings,console
});
vm.runInContext(source,context);
const handler=vm.runInContext("handler",context);
const run=cursor=>handler({method:"POST",body:{action:"index",cursor}},{});
const quota=await run(null);
assert.equal(quota.status,429,"Quota exhaustion must not report success");
assert.equal(writes,0,"Failed batch should not change records");
const first=await run(null);
assert.equal(first.status,200);
assert.equal(first.body.processed,100);
assert.equal(first.body.updated,100);
assert.equal(first.body.done,false);
assert.ok(first.body.cursor);
assert.equal(writes,100);
const retry=await run(null);
assert.equal(retry.status,200);
assert.equal(retry.body.updated,0,"Already indexed rows should not be rewritten");
assert.equal(writes,100);
const last=await run(first.body.cursor);
assert.equal(last.status,200);
assert.equal(last.body.processed,5);
assert.equal(last.body.updated,5);
assert.equal(last.body.done,true);
assert.equal(last.body.cursor,null);
assert.equal(writes,105);
settings.env.CRM_MANAGER_EMAILS="someoneelse@example.test";
assert.equal((await run(null)).status,403,"Indexing stays manager-only");
console.log("Customer indexing regression passed: quota retry, paginated cursor, idempotent reindexing, manager authorization.");
