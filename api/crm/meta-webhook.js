import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import {db,firebaseAdmin} from "../../lib/firebase.js";

// Webhook oficial da Meta. Jamais recebe login nem consentimento por URL pública.
export const config={api:{bodyParser:false}};
const sha=x=>createHash("sha256").update(x).digest("hex").slice(0,32);
const stamp=()=>firebaseAdmin().firestore.FieldValue.serverTimestamp();
const rank={accepted:0,sent:1,delivered:2,read:3};
function plain(res,status,value){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.status(status).send(value);
}
export default async function handler(req,res){
 if(req.method==="GET"){
  const token=process.env.PATTY_META_WEBHOOK_VERIFY_TOKEN;
  const mode=req.query?.["hub.mode"],challenge=req.query?.["hub.challenge"];
  if(!token||mode!=="subscribe"||req.query?.["hub.verify_token"]!==token||!/^\d{1,30}$/.test(String(challenge||"")))
    return plain(res,403,"Forbidden");
  return plain(res,200,String(challenge));
 }
 if(req.method!=="POST")return plain(res,405,"Method Not Allowed");
 const secret=process.env.PATTY_META_APP_SECRET;
 if(!secret)return plain(res,503,"Webhook not configured");
 try{
  const chunks=[];let length=0;
  for await(const chunk of req){
    length+=chunk.length;
    if(length>256000)return plain(res,413,"Payload too large");
    chunks.push(chunk);
  }
  const body=Buffer.concat(chunks),signature=String(req.headers["x-hub-signature-256"]||"");
  const expected="sha256="+createHmac("sha256",secret).update(body).digest("hex");
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))
    return plain(res,403,"Invalid signature");
  const parsed=JSON.parse(body.toString("utf8"));
  if(parsed.object!=="whatsapp_business_account")return plain(res,200,"OK");
  const statuses=[];
  for(const entry of (Array.isArray(parsed.entry)?parsed.entry:[])){
    for(const change of (Array.isArray(entry.changes)?entry.changes:[])){
      for(const status of (Array.isArray(change.value?.statuses)?change.value.statuses:[])){
        if(status?.id&&["sent","delivered","read","failed"].includes(status.status))
          statuses.push({wamid:String(status.id),state:status.status});
      }
    }
  }
  // Um webhook com muitos eventos não pode causar leituras sem limite.
  const database=db();let applied=0;
  for(const status of statuses.slice(0,40)){
    const index=await database.collection("patty_whatsapp_message_index").doc(sha(status.wamid)).get();
    if(!index.exists)continue;
    const {campaignId,recipientId}=index.data(),campRef=database.collection("patty_campaigns").doc(campaignId);
    const ref=campRef.collection("recipients").doc(recipientId);
    await database.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists||current.data().wamid!==status.wamid)return;
      const before=current.data().status||"accepted";
      if(before==="excluded"||before==="unknown")return;
      if(status.state==="failed"){
        if(["failed","delivered","read"].includes(before))return;
        tx.update(ref,{status:"failed",deliveryStatusAt:stamp(),deliveryError:"Meta informou falha"});
        tx.update(campRef,{failedCount:firebaseAdmin().firestore.FieldValue.increment(1),updatedAt:stamp()});
        applied++;return;
      }
      if(before==="failed"||(rank[status.state]??0)<=(rank[before]??0))return;
      const changes={status:status.state,deliveryStatusAt:stamp()};
      tx.update(ref,changes);
      const increments={updatedAt:stamp()};
      if(status.state==="sent")increments.sentCount=firebaseAdmin().firestore.FieldValue.increment(1);
      if(status.state==="delivered")increments.deliveredCount=firebaseAdmin().firestore.FieldValue.increment(1);
      if(status.state==="read")increments.readCount=firebaseAdmin().firestore.FieldValue.increment(1);
      tx.update(campRef,increments);
      applied++;
    });
  }
  return plain(res,200,"OK");
 }catch(e){
  if(e instanceof SyntaxError)return plain(res,400,"Invalid JSON");
  console.error("Meta webhook Patty:",e.message);
  return plain(res,503,"Temporary webhook error");
 }
}
