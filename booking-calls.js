import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const wait = ms => new Promise(r => setTimeout(r, ms));
let sb, user, amin, activeCallId = "", pc = null, localStream = null, remoteStream = null;
let callChannel = null, signalChannel = null, videoEnabled = false, refreshBusy = false, seenSignalIds = new Set(), pendingIceCandidates = [];
const $ = id => document.getElementById(id);
const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = message => { const el=$("toast"); if(el){el.textContent=message;el.style.display="block";setTimeout(()=>el.style.display="none",3200);} else alert(message); };
async function api(action, extra={}) {
 const {data,error}=await sb.functions.invoke("booking-calls",{body:{action,...extra}});
 if(error)throw error;if(!data?.success)throw new Error(data?.error||"Call request failed.");return data;
}
function mountCallUi(){
 if(!$("myAminCallStyles")){
  const style=document.createElement("style");style.id="myAminCallStyles";style.textContent=`
   .myamin-call-center{border:1px solid #dcebe2;background:#f8fcf9;border-radius:16px;padding:14px;margin:14px 0;min-width:0}
   .myamin-call-center h4{margin:0 0 8px;color:#123b32}.myamin-call-card{border:1px solid #e1ebe5;border-radius:12px;background:white;padding:12px;margin:9px 0;min-width:0}
   .myamin-call-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.myamin-call-actions button{border:0;border-radius:10px;padding:9px 12px;font-weight:700;background:#08785b;color:white}
   .myamin-call-actions button.secondary{background:#eaf4ed;color:#164536}.myamin-call-actions button.danger{background:#ffe9ed;color:#b42345}
   .myamin-video-setting{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.myamin-video-setting input{width:20px;height:20px}
   .myamin-call-overlay{position:fixed;inset:0;z-index:999999;background:#071c16ee;display:none;align-items:center;justify-content:center;padding:12px}
   .myamin-call-overlay.show{display:flex}.myamin-call-window{width:min(900px,100%);background:#10251f;color:white;border:1px solid #ffffff2a;border-radius:18px;padding:14px}
   .myamin-call-videos{display:grid;grid-template-columns:1fr 1fr;gap:10px}.myamin-call-videos video{width:100%;max-height:52vh;min-height:170px;object-fit:cover;background:#000;border-radius:12px}
   .myamin-call-window audio{width:100%}.myamin-call-window button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;background:#e34b67;color:white}
   @media(max-width:600px){.myamin-call-videos{grid-template-columns:1fr}.myamin-call-videos video{max-height:34vh;min-height:120px}}
  `;document.head.appendChild(style);
 }
 if(!$("myAminCallOverlay")){
  const overlay=document.createElement("div");overlay.id="myAminCallOverlay";overlay.className="myamin-call-overlay";
  overlay.innerHTML='<div class="myamin-call-window"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong id="myAminCallTitle">My Amin call</strong><button id="myAminEndCall" type="button">End call</button></div><p id="myAminCallStatus" style="color:#c8ddd2">Connecting…</p><div class="myamin-call-videos"><video id="myAminLocalVideo" autoplay playsinline muted></video><video id="myAminRemoteVideo" autoplay playsinline></video></div><audio id="myAminRemoteAudio" autoplay></audio></div>';
  document.body.appendChild(overlay);$("myAminEndCall").addEventListener("click",endCall);
 }
}
function ensurePanel(anchorId,panelId,title){
 const anchor=$(anchorId);if(!anchor)return null;
 let panel=$(panelId);if(!panel){panel=document.createElement("section");panel.id=panelId;panel.className="myamin-call-center";panel.innerHTML='<h4>'+safe(title)+'</h4><div class="myamin-call-list">Loading calls…</div>';anchor.insertAdjacentElement("afterend",panel);}
 return panel;
}
function renderVideoSetting(){
 if(!amin)return;
 const gps=$("aminGpsShareStatus");if(!gps?.parentElement)return;
 let setting=$("myAminVideoSetting");if(!setting){setting=document.createElement("div");setting.id="myAminVideoSetting";setting.className="myamin-video-setting";gps.parentElement.appendChild(setting);}
 setting.innerHTML='<label style="font-weight:750">Allow optional video calls</label><input id="myAminVideoEnabled" type="checkbox" '+(videoEnabled?"checked":"")+'><small>'+(videoEnabled?"Customers can request a video call after booking.":"Video calls are off. Voice calls remain available.")+'</small>';
 $("myAminVideoEnabled").addEventListener("change",async e=>{
  const next=e.target.checked;e.target.disabled=true;
  try{const {error}=await sb.from("amin_profiles").update({video_call_enabled:next,updated_at:new Date().toISOString()}).eq("user_id",user.id);if(error)throw error;videoEnabled=next;renderVideoSetting();await refreshCalls();toast(next?"Video call requests enabled.":"Video call requests disabled.");}
  catch(err){e.target.checked=!next;toast("Video setting could not be saved: "+err.message);}
  finally{e.target.disabled=false;}
 });
}
async function loadContext(){
 const {data:{user:u},error}=await sb.auth.getUser();if(error)throw error;if(!u)return;
 user=u;
 const {data:a,error:ae}=await sb.from("amin_profiles").select("user_id,video_call_enabled,approval_status,account_status").eq("user_id",u.id).maybeSingle();if(ae)throw ae;
 amin=a;videoEnabled=!!a?.video_call_enabled;
 if(amin)renderVideoSetting();
 ensurePanel(amin?"accountBookings":"customerAccountBookings","myAminCallCenter",amin?"Booking calls & customer requests":"Talk to your booked Amin");
}
async function loadMyBookings(){
 const query=sb.from("bookings").select("id,customer_user_id,amin_user_id,service,status,place,district,state,created_at").order("created_at",{ascending:false}).limit(60);
 const {data,error}=amin?await query.eq("amin_user_id",user.id):await query.eq("customer_user_id",user.id);
 if(error)throw error;
 const ids=[...new Set((data||[]).map(b=>amin?b.customer_user_id:b.amin_user_id).filter(Boolean))];
 let counterpartMap=new Map(),videoMap=new Map();
 if(ids.length){
  const [profiles,amins]=await Promise.all([
   sb.from("user_profiles").select("id,full_name,phone").in("id",ids),
   sb.from("amin_profiles").select("user_id,display_name,phone,video_call_enabled,approval_status,account_status").in("user_id",ids)
  ]);
  if(profiles.error)throw profiles.error;if(amins.error)throw amins.error;
  for(const p of profiles.data||[])counterpartMap.set(p.id,p.full_name||"Customer");
  for(const a of amins.data||[]){counterpartMap.set(a.user_id,a.display_name||"Amin");videoMap.set(a.user_id,!!a.video_call_enabled&&a.approval_status==="approved"&&a.account_status==="active");}
 }
 return (data||[]).filter(b=>b.amin_user_id&&b.status!=="cancelled").map(b=>({...b,otherName:counterpartMap.get(amin?b.customer_user_id:b.amin_user_id)|| (amin?"Customer":"Amin"),otherId:amin?b.customer_user_id:b.amin_user_id,canVideo:amin?videoEnabled:!!videoMap.get(b.amin_user_id)}));
}
async function refreshCalls(){
 if(!sb||!user||refreshBusy)return;refreshBusy=true;
 try{
  const panel=$("myAminCallCenter");if(!panel)return;
  const [bookingsRes,callsRes]=await Promise.all([
   loadMyBookings(),
   sb.from("booking_calls").select("id,booking_id,caller_user_id,callee_user_id,call_type,status,created_at").or("caller_user_id.eq."+user.id+",callee_user_id.eq."+user.id).order("created_at",{ascending:false}).limit(40)
  ]);
  if(callsRes.error)throw callsRes.error;
  const bookings=bookingsRes,calls=callsRes.data||[],activeIds=new Set(calls.filter(c=>["requested","accepted"].includes(c.status)).map(c=>c.booking_id));
  const requestHtml=bookings.map(b=>{
   const has=activeIds.has(b.id),audio='<button type="button" data-call-start="audio" data-booking="'+safe(b.id)+'">Voice call</button>';
   const video=b.canVideo?'<button type="button" class="secondary" data-call-start="video" data-booking="'+safe(b.id)+'">Request video call</button>':'';
   return '<article class="myamin-call-card"><strong>'+safe(b.otherName)+' · '+safe(b.service||"Booking")+'</strong><p style="margin:5px 0;color:#687b72;font-size:12px">Booking: '+safe(b.status||"pending")+' · '+safe([b.place,b.district,b.state].filter(Boolean).join(", "))+'</p><div class="myamin-call-actions">'+(has?'<span class="pill">Call request already active</span>':audio+video)+'</div></article>';
  }).join("");
  const callHtml=calls.map(c=>{
   const incoming=c.callee_user_id===user.id&&c.status==="requested";
   const outgoing=c.caller_user_id===user.id&&c.status==="requested";
   const status=c.status==="requested"?(incoming?"Incoming request":outgoing?"Waiting for reply":"Requested"):c.status;
   return '<article class="myamin-call-card"><strong>'+(c.call_type==="video"?"Video call":"Voice call")+'</strong><p style="margin:5px 0;color:#687b72;font-size:12px">'+safe(status)+' · '+safe(new Date(c.created_at).toLocaleString())+'</p><div class="myamin-call-actions">'+(incoming?'<button type="button" data-call-accept="'+safe(c.id)+'">Accept</button><button type="button" class="danger" data-call-reject="'+safe(c.id)+'">Decline</button>':outgoing?'<button type="button" class="danger" data-call-end="'+safe(c.id)+'">Cancel request</button>':c.status==="accepted"?'<button type="button" data-call-join="'+safe(c.id)+'">Join call</button><button type="button" class="danger" data-call-end="'+safe(c.id)+'">End</button>':'')+'</div></article>';
  }).join("");
  const list=panel.querySelector(".myamin-call-list");if(list)list.innerHTML=(requestHtml||'<p>No assigned bookings available for calls yet.</p>')+(callHtml?'<h4 style="margin-top:16px">Recent call requests</h4>'+callHtml:"");
  panel.querySelectorAll("[data-call-start]").forEach(btn=>btn.onclick=()=>startCall(btn.dataset.booking,btn.dataset.callStart));
  panel.querySelectorAll("[data-call-accept]").forEach(btn=>btn.onclick=()=>acceptCall(btn.dataset.callAccept));
  panel.querySelectorAll("[data-call-reject]").forEach(btn=>btn.onclick=()=>updateCall("reject",btn.dataset.callReject));
  panel.querySelectorAll("[data-call-end]").forEach(btn=>btn.onclick=()=>updateCall("end",btn.dataset.callEnd));
  panel.querySelectorAll("[data-call-join]").forEach(btn=>btn.onclick=()=>joinCall(calls.find(c=>c.id===btn.dataset.callJoin)));
 }catch(e){const list=$("myAminCallCenter")?.querySelector(".myamin-call-list");if(list)list.textContent="Calls could not load: "+(e.message||"Unknown error");}
 finally{refreshBusy=false;}
}
async function startCall(bookingId,type){
 try{await api("start",{booking_id:bookingId,call_type:type});toast(type==="video"?"Video request sent. Amin must approve it.":"Voice call request sent. The other participant must accept.");await refreshCalls();}
 catch(e){toast(e.message||"Call request failed.");}
}
async function acceptCall(id){
 try{await api("accept",{call_id:id});const {data:call,error}=await sb.from("booking_calls").select("*").eq("id",id).single();if(error)throw error;await joinCall(call);await refreshCalls();}
 catch(e){toast(e.message||"Could not accept call.");}
}
async function updateCall(action,id){try{await api(action,{call_id:id});if(action==="end")cleanupCall();await refreshCalls();}catch(e){toast(e.message||"Call update failed.");}}
async function insertSignal(type,payload){if(!activeCallId)return;const {error}=await sb.from("booking_call_signals").insert({call_id:activeCallId,sender_user_id:user.id,signal_type:type,payload});if(error)throw error;}
async function joinCall(call){
 if(!call||call.status!=="accepted"||activeCallId===call.id)return;
 activeCallId=call.id;mountCallUi();$("myAminCallOverlay").classList.add("show");$("myAminCallTitle").textContent=call.call_type==="video"?"My Amin video call":"My Amin voice call";$("myAminCallStatus").textContent="Allow microphone"+(call.call_type==="video"?" and camera":"")+" access.";
 try{
  localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:call.call_type==="video"});
  $("myAminLocalVideo").srcObject=call.call_type==="video"?localStream:null;$("myAminLocalVideo").style.display=call.call_type==="video"?"block":"none";
  $("myAminRemoteVideo").style.display=call.call_type==="video"?"block":"none";
  $("myAminRemoteAudio").style.display=call.call_type==="video"?"none":"block";
  remoteStream=new MediaStream();$("myAminRemoteVideo").srcObject=remoteStream;$("myAminRemoteAudio").srcObject=remoteStream;
  pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});
  localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  pc.ontrack=e=>{e.streams[0].getTracks().forEach(t=>remoteStream.addTrack(t));$("myAminCallStatus").textContent="Connected";};
  pc.onicecandidate=e=>{if(e.candidate)insertSignal("ice-candidate",e.candidate.toJSON()).catch(err=>console.warn(err));};
  pc.onconnectionstatechange=()=>{$("myAminCallStatus").textContent="Call status: "+pc.connectionState;if(["failed","disconnected","closed"].includes(pc.connectionState)&&pc.connectionState==="failed")toast("Network connection failed. Please try again.");};
  if(signalChannel)await sb.removeChannel(signalChannel);
  signalChannel=sb.channel("booking-call-signals-"+call.id);
  const handleSignal=async sig=>{
   if(!sig||seenSignalIds.has(sig.id))return;seenSignalIds.add(sig.id);
   if(sig.sender_user_id===user.id||!pc)return;
   try{
    if(sig.signal_type==="offer"){await pc.setRemoteDescription(sig.payload);for(const candidate of pendingIceCandidates.splice(0))await pc.addIceCandidate(candidate);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await insertSignal("answer",pc.localDescription.toJSON());}
    else if(sig.signal_type==="answer"){await pc.setRemoteDescription(sig.payload);for(const candidate of pendingIceCandidates.splice(0))await pc.addIceCandidate(candidate);}
    else if(sig.signal_type==="ice-candidate"){if(pc.remoteDescription)await pc.addIceCandidate(sig.payload);else pendingIceCandidates.push(sig.payload);}
    else if(sig.signal_type==="hangup"){cleanupCall();}
   }catch(err){console.error("Call signal error",err);}
  };
  signalChannel.on("postgres_changes",{event:"INSERT",schema:"public",table:"booking_call_signals",filter:"call_id=eq."+call.id},event=>handleSignal(event.new)).subscribe(async status=>{
   if(status==="SUBSCRIBED"){
    const {data:existing,error:signalError}=await sb.from("booking_call_signals").select("id,sender_user_id,signal_type,payload,created_at").eq("call_id",call.id).neq("sender_user_id",user.id).order("created_at",{ascending:true});
    if(!signalError)for(const sig of existing||[])await handleSignal(sig);
    if(user.id===call.caller_user_id&&pc?.signalingState==="stable"){
     const offer=await pc.createOffer();await pc.setLocalDescription(offer);await insertSignal("offer",pc.localDescription.toJSON());
    }
   }
  });
 }catch(e){$("myAminCallStatus").textContent=e.message||"Microphone/camera permission failed.";toast("Call could not start: "+(e.message||"Check microphone/camera permission."));}
}
async function endCall(){
 const id=activeCallId;if(id){try{await insertSignal("hangup",{});}catch{}try{await api("end",{call_id:id});}catch{}}
 cleanupCall();await refreshCalls();
}
function cleanupCall(){
 if(signalChannel){sb.removeChannel(signalChannel);signalChannel=null;}
 if(callChannel){sb.removeChannel(callChannel);callChannel=null;}
 if(pc){pc.close();pc=null;}
 if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
 remoteStream=null;activeCallId="";if($("myAminCallOverlay"))$("myAminCallOverlay").classList.remove("show");
}
async function subscribeCalls(){
 if(callChannel)await sb.removeChannel(callChannel);
 callChannel=sb.channel("booking-calls-user-"+user.id);
 callChannel.on("postgres_changes",{event:"*",schema:"public",table:"booking_calls"},payload=>{
  const row=payload.new||payload.old;if(!row||row.caller_user_id!==user.id&&row.callee_user_id!==user.id)return;
  if(row.status==="accepted"&&row.caller_user_id===user.id&&activeCallId!==row.id)joinCall(row);
  refreshCalls();
 }).subscribe();
}
async function init(){
 for(let n=0;n<80&&!window.myAminSupabase;n++)await wait(250);
 sb=window.myAminSupabase;if(!sb)return;
 mountCallUi();await loadContext();await refreshCalls();await subscribeCalls();
 setInterval(()=>{if(user)refreshCalls();},8000);
 sb.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user?.id){setTimeout(async()=>{cleanupCall();user=null;amin=null;videoEnabled=false;if(session?.user){try{await loadContext();await refreshCalls();await subscribeCalls();}catch(e){console.error(e);}}},0);}});
}
init().catch(e=>console.error("My Amin booking calls:",e));
