import {createClient} from "https://esm.sh/@supabase/supabase-js@2.105.0";
const supabase=window.myAminSupabase||createClient("https://cxchbvygydfrtkdmkmpa.supabase.co","sb_publishable_2xA7HmAgyn6Sr_kdpeTNZA_XIGBpZ-l",{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
let busy=false,recognition=null,recorder=null,chunks=[],chatOpen=false,voiceMode=false,voiceRestartTimer=null,autoStream=null,autoContext=null,autoAnalyser=null,autoFrame=0,autoSpeaking=false,autoSilenceAt=0,autoRecorderMime="";
const micSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"></path></svg>';
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function speech(text){return new Promise(resolve=>{if(!("speechSynthesis"in window)){resolve();return}window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=/[\u0900-\u097F]/.test(text)?"hi-IN":"en-IN";u.rate=1;u.onend=resolve;u.onerror=resolve;window.speechSynthesis.speak(u)})}
async function ask(message,media=null,mediaKind="audio"){
 if(busy)return;busy=true;setState("मित्र AI सोच रहा है…");
 try{
  const {data:s}=await supabase.auth.getSession();
  if(!s.session)throw Error("MyAmin में पहले Login करें।");
  const body={action:"chat",message:message||"",siteContext:{page:location.pathname+location.hash}};
  if(media)body[mediaKind]=media;
  const {data,error}=await supabase.functions.invoke("myamin-ai",{body});
  if(error)throw error;if(data?.error)throw Error(data.error);
  showAnswer(data.answer);if($("mitraChatLog"))addChat("assistant",data.answer);await speech(data.answer);
 }catch(e){setState(e.message||"अभी AI से संपर्क नहीं हो पाया।");}
 finally{busy=false;if(voiceMode){if(recognition)resumeVoice();else if(autoStream)resumeAutoCapture();else resumeVoice()}}
}
function setState(s){const n=$("mitraState");if(n)n.textContent=s}
function showAnswer(s){const n=$("mitraAnswer");if(n){n.hidden=false;n.textContent=s;}}
function selectedLanguage(){try{return localStorage.getItem("myamin_language")==="hi"?"hi":"en"}catch(_){return "en"}}
function resumeVoice(){
 if(!voiceMode||busy||autoStream)return;
 startAutoCapture();
}
async function startAutoCapture(){
 if(!voiceMode||autoStream||busy)return;
 try{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("Automatic voice listening is not supported by this browser. Please try the latest Safari.");
  autoStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error("Audio capture is not supported on this device.");
  autoContext=new AC();await autoContext.resume();const source=autoContext.createMediaStreamSource(autoStream);
  autoAnalyser=autoContext.createAnalyser();autoAnalyser.fftSize=1024;source.connect(autoAnalyser);
  autoRecorderMime=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t))||"";
  setState(selectedLanguage()==="hi"?"मैं सुन रहा हूँ… बोलिए":"Listening… go ahead");resumeAutoCapture();
 }catch(e){stopAutoCapture();voiceMode=false;setState(e.message||"Please allow microphone access and try again.")}
}
function resumeAutoCapture(){
 if(!voiceMode||!autoAnalyser||autoFrame)return;
 const samples=new Uint8Array(autoAnalyser.fftSize);
 const tick=()=>{
  if(!voiceMode){autoFrame=0;return}
  autoAnalyser.getByteTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v}
  const rms=Math.sqrt(sum/samples.length),now=Date.now();
  if(!busy){
   if(rms>0.016){
    autoSilenceAt=0;
    if(!autoSpeaking){autoSpeaking=true;chunks=[];try{
     recorder=new MediaRecorder(autoStream,autoRecorderMime?{mimeType:autoRecorderMime}:undefined);
     const active=recorder;active.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
     active.onstop=()=>{const blob=new Blob(chunks,{type:active.mimeType||autoRecorderMime||"audio/mp4"});if(recorder===active)recorder=null;autoSpeaking=false;
      if(blob.size&&voiceMode){const reader=new FileReader();reader.onload=()=>ask("Listen to my voice and answer naturally in the same language I spoke (Hindi or English).",{mimeType:blob.type.split(";")[0],data:String(reader.result).split(",")[1]},"audio");reader.onerror=()=>setState("Audio could not be read. Listening again…");reader.readAsDataURL(blob)}
     };active.start();
    }catch(_){autoSpeaking=false;setState("Microphone recording could not start.")}}
   }else if(autoSpeaking&&recorder?.state==="recording"){
    if(!autoSilenceAt)autoSilenceAt=now;
    if(now-autoSilenceAt>1150){setState(selectedLanguage()==="hi"?"आपकी बात समझ रहा हूँ…":"Thinking…");recorder.stop();autoSilenceAt=0}
   }
  }
  autoFrame=requestAnimationFrame(tick);
 };
 autoFrame=requestAnimationFrame(tick);
}
function stopAutoCapture(){
 if(autoFrame)cancelAnimationFrame(autoFrame);autoFrame=0;
 if(recorder?.state==="recording"){try{recorder.stop()}catch(_){}}recorder=null;autoSpeaking=false;
 if(autoStream)autoStream.getTracks().forEach(t=>t.stop());autoStream=null;
 if(autoContext){autoContext.close().catch(()=>{});autoContext=null}autoAnalyser=null;
}
function startVoice(){
 voiceMode=true;const greeting=selectedLanguage()==="hi"?"नमस्कार! मैं आपकी क्या सहायता कर सकता हूँ?":"Hello! How can I help you?";
 setState(greeting);speech(greeting).then(()=>{if(voiceMode)resumeVoice()});
}
async function recordFallback(){
 try{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("इस browser में voice recording उपलब्ध नहीं है।");
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const types=["audio/mp4","audio/webm;codecs=opus","audio/ogg;codecs=opus"];
  const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||"";
  const activeRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  recorder=activeRecorder;chunks=[];
  activeRecorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  activeRecorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());recorder=null;setState("रिकॉर्डिंग में समस्या हुई। फिर से प्रयास करें।")};
  activeRecorder.onstop=async()=>{
   stream.getTracks().forEach(t=>t.stop());if(recorder===activeRecorder)recorder=null;
   $("mitraMic")?.classList.remove("recording");
   const blob=new Blob(chunks,{type:activeRecorder.mimeType||"audio/mp4"});
   if(!blob.size){setState("आवाज़ रिकॉर्ड नहीं हुई। फिर से माइक दबाएँ।");return}
   if(blob.size>8*1024*1024){setState("रिकॉर्डिंग बहुत लंबी है। छोटा बोलकर फिर प्रयास करें।");return}
   setState("आपकी आवाज़ समझ रहा हूँ…");
   const reader=new FileReader();
   reader.onload=()=>{const data=String(reader.result).split(",")[1];ask("इस आवाज़ को सुनकर उपयोगकर्ता की बात का उत्तर दें।", {mimeType:blob.type,data},"audio")};
   reader.onerror=()=>setState("ऑडियो पढ़ने में समस्या हुई। फिर से प्रयास करें।");
   reader.readAsDataURL(blob);
  };
  activeRecorder.start();setState("सुन रहा हूँ… बोलना पूरा होने पर mic दबाएँ");$("mitraMic")?.classList.add("recording");
 }catch(e){setState(e.message||"माइक्रोफोन की अनुमति दें।")}
}
function micClick(){
 if(voiceMode){voiceMode=false;clearTimeout(voiceRestartTimer);if(recognition){const r=recognition;recognition=null;try{r.stop()}catch(_){}}if(recorder?.state==="recording")recorder.stop();window.speechSynthesis?.cancel();setState("Voice session बंद है। फिर शुरू करने के लिए mic दबाएँ।");return}
 if(recorder?.state==="recording"){recorder.stop();setState("आपकी आवाज़ समझ रहा हूँ…");return}
 startVoice();
}
function addChat(role,text){const n=document.createElement("div");n.className="mitra-line "+role;n.textContent=text;$("mitraChatLog").append(n);$("mitraChatLog").scrollTop=$("mitraChatLog").scrollHeight}
async function chatSend(){const v=$("mitraText").value.trim();if(!v||busy)return;$("mitraText").value="";addChat("user",v);await ask(v)}
function mount(){
 if($("mitraLauncher"))return;
 const launcher=document.createElement("button");launcher.id="mitraLauncher";launcher.type="button";launcher.setAttribute("aria-label","मित्र AI खोलें");launcher.innerHTML=micSvg;
 const panel=document.createElement("section");panel.id="mitraPanel";
 panel.innerHTML='<div class="mitra-mini-head"><span class="mitra-head-mic">'+micSvg+'</span><b>मित्र AI</b><button id="mitraClose" type="button" aria-label="Close">×</button></div><div id="mitraState">माइक दबाकर बात करें</div><div id="mitraAnswer" hidden></div><button id="mitraMic" type="button" aria-label="Activate microphone">'+micSvg+'</button><button id="mitraChatToggle" type="button">Chat</button><div id="mitraChatBox" hidden><div id="mitraChatLog"></div><div class="mitra-chat-row"><input id="mitraText" placeholder="Message मित्र AI"><button id="mitraSend" type="button">Send</button><label for="mitraImage">＋</label><input id="mitraImage" type="file" accept="image/png,image/jpeg,image/webp" hidden></div></div>';
 document.body.append(launcher,panel);
 launcher.onclick=()=>{panel.classList.add("open");if(!voiceMode)startVoice();};
 $("mitraClose").onclick=()=>{panel.classList.remove("open");voiceMode=false;clearTimeout(voiceRestartTimer);if(recognition){try{recognition.stop()}catch(_){}recognition=null}stopAutoCapture();window.speechSynthesis?.cancel()};
 $("mitraMic").onclick=micClick;
 $("mitraChatToggle").onclick=()=>{chatOpen=!chatOpen;$("mitraChatBox").hidden=!chatOpen};
 $("mitraSend").onclick=chatSend;
 $("mitraText").onkeydown=e=>{if(e.key==="Enter")chatSend()};
 $("mitraImage").onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>4*1024*1024){setState("Image 4 MB से छोटी होनी चाहिए");e.target.value="";return}const r=new FileReader();r.onload=()=>ask("इस image में क्या दिख रहा है?",{mimeType:f.type,data:String(r.result).split(",")[1]},"image");r.onerror=()=>setState("Image पढ़ने में समस्या हुई।");r.readAsDataURL(f)};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
