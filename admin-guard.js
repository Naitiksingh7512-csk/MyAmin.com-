import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";
const sb=createClient("https://cxchbvygydfrtkdmkmpa.supabase.co","sb_publishable_2xA7HmAgyn6Sr_kdpeTNZA_XIGBpZ-l",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.myAminSupabase=sb;
const home="https://naitiksingh7512-csk.github.io/MyAmin.com-/#adminLogin";
(async()=>{
 try{
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.user)throw new Error("Sign in required");
  const {data:member,error}=await sb.from("admin_team_members").select("role,status").eq("user_id",session.user.id).maybeSingle();
  if(error)throw error;
  if(session.user.app_metadata?.role!=="admin"||member?.role!=="admin"||member?.status!=="active")throw new Error("Admin access denied");
  document.documentElement.classList.add("admin-ready");
 }catch(e){
  await sb.auth.signOut();
  location.replace(home);
 }
})();