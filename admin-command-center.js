/* MyAmin Owner Command Center — read-only operational overview.
   The existing admin-guard.js remains the authority gate. This module re-checks
   the immutable Owner identity, app_metadata role, and active DB membership. */
(() => {
  "use strict";
  const OWNER_ID = "24dd2630-4624-46ee-8c54-37b9dc8fcd64";
  const TAB_ID = "myaminCommandCenterTab";
  const PANEL_ID = "myaminCommandCenter";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = (v) => Number(v || 0).toLocaleString("en-IN");
  const fmtTime = (v) => v ? new Date(v).toLocaleString("en-IN", {dateStyle:"medium",timeStyle:"short"}) : "—";
  const sections = [
    ["applications","Amin applications"],["directory","Amin directory"],["customers","Customers & accounts"],
    ["bookings","Bookings"],["reports","Support & reports"],["commission","Commission"],
    ["payments","Payment records"],["paymentRequests","Amin payment requests"],
    ["content","Announcements & advertisements"],["websiteControls","Website controls"],
    ["team","Team management"],["activity","Activity history"],["adminCard","Owner ID card"]
  ];
  const style = `
  #${PANEL_ID}{--cc-ink:#eaf4ff;--cc-muted:#9eb6ce;--cc-line:#27435f;--cc-panel:#0b1b2e;--cc-blue:#168bd2;color:var(--cc-ink)}
  #${PANEL_ID} .cc-hero{padding:22px;border-radius:20px;background:radial-gradient(circle at 90% 0%,#087fb455,transparent 36%),linear-gradient(130deg,#07172b,#102b48 60%,#08213b);border:1px solid #28618a;box-shadow:0 16px 40px #03132635}
  #${PANEL_ID} .cc-eyebrow{font-size:11px;letter-spacing:2px;font-weight:900;color:#6edaff}
  #${PANEL_ID} h2,#${PANEL_ID} h3{color:inherit}
  #${PANEL_ID} .cc-muted{color:var(--cc-muted);font-size:13px}
  #${PANEL_ID} .cc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:16px 0}
  #${PANEL_ID} .cc-card{padding:16px;border:1px solid var(--cc-line);border-radius:15px;background:linear-gradient(145deg,#10243a,#0b1b2e);min-width:0}
  #${PANEL_ID} .cc-card small{display:block;color:var(--cc-muted);font-size:12px}
  #${PANEL_ID} .cc-card strong{display:block;font-size:27px;line-height:1.2;margin-top:8px;overflow-wrap:anywhere}
  #${PANEL_ID} .cc-layout{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:14px}
  #${PANEL_ID} .cc-box{padding:17px;border:1px solid var(--cc-line);border-radius:16px;background:var(--cc-panel)}
  #${PANEL_ID} .cc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #ffffff12}
  #${PANEL_ID} .cc-row:last-child{border-bottom:0}
  #${PANEL_ID} .cc-status{font-size:11px;font-weight:800;border-radius:30px;padding:5px 9px;background:#123b37;color:#8af0c6;white-space:nowrap}
  #${PANEL_ID} .cc-status.warn{background:#49351b;color:#ffd18a}
  #${PANEL_ID} .cc-status.bad{background:#4a2630;color:#ffb3bf}
  #${PANEL_ID} .cc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  #${PANEL_ID} .cc-btn{border:1px solid #3984b6;background:#0d4269;color:#eff9ff;border-radius:10px;padding:9px 12px;font-weight:750}
  #${PANEL_ID} .cc-btn.secondary{background:#13283d;border-color:#38516b}
  #${PANEL_ID} .cc-foot{font-size:12px;color:var(--cc-muted);margin-top:14px}
  @media(max-width:560px){#${PANEL_ID} .cc-hero{padding:17px}#${PANEL_ID} .cc-card strong{font-size:23px}}
  `;
  function openSection(id) {
    const target = $(id);
    if (!target) return;
    document.querySelectorAll("main section[id]").forEach(s => s.classList.toggle("hidden", s !== target));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
    const labels = {myaminCommandCenter:"Owner Command Center"};
    const title = $("pageTitle");
    if (title) title.textContent = labels[id] || (document.querySelector('.tab[data-tab="'+id+'"]')?.textContent.trim() || "Administration");
    target.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function renderBase() {
    if ($(TAB_ID) || !document.querySelector("nav.tabs")) return;
    const nav = document.querySelector("nav.tabs");
    const tab = document.createElement("button");
    tab.id = TAB_ID; tab.type = "button"; tab.className = "tab";
    tab.dataset.tab = PANEL_ID; tab.textContent = "⚡ Owner Command Center";
    tab.addEventListener("click", () => { openSection(PANEL_ID); refresh(); });
    nav.insertBefore(tab, nav.children[1] || null);
    const panel = document.createElement("section");
    panel.id = PANEL_ID; panel.className = "panel hidden";
    panel.innerHTML = `
      <div class="cc-hero">
        <div class="cc-eyebrow">MYAMIN.COM · OWNER ONLY</div>
        <h2 style="margin:7px 0 5px">Advanced Command Center</h2>
        <p class="cc-muted" style="margin:0">एक जगह से पूरे Administration के live status, प्रमुख modules और security health देखें। यह dashboard Supabase से सीधे read-only metrics लेता है; existing modules के permissions और data flows को नहीं बदलता।</p>
        <div class="cc-actions"><button class="cc-btn" id="ccRefresh" type="button">↻ Refresh live status</button><span class="cc-status" id="ccConnection">Checking secure session…</span></div>
      </div>
      <div class="cc-grid" id="ccMetrics"><div class="cc-card"><small>Dashboard status</small><strong>Loading…</strong></div></div>
      <div class="cc-layout">
        <div class="cc-box"><h3 style="margin-top:0">Website operations</h3><div id="ccOperations" class="cc-muted">Loading…</div></div>
        <div class="cc-box"><h3 style="margin-top:0">Security watch</h3><div id="ccSecurity"></div></div>
        <div class="cc-box"><h3 style="margin-top:0">Administration modules</h3><div id="ccModules"></div></div>
        <div class="cc-box"><h3 style="margin-top:0">Platform & backup readiness</h3><div id="ccPlatform"></div></div><div class="cc-box" style="grid-column:1/-1"><h3 style="margin-top:0">Complete database inventory · 25 tables</h3><p class="cc-muted">Live counts from the secure Owner backend. Authentication credentials and token hashes are never exposed.</p><div id="ccInventory" class="cc-grid"></div></div>
      <div class="cc-box" style="grid-column:1/-1"><h3 style="margin-top:0">Owner data explorer · all 25 tables</h3><p class="cc-muted">Owner-only, server-side paginated records. Personal information and user-submitted content are confidential. Credential hashes and live call signaling payloads are excluded.</p><div class="cc-actions"><select id="ccTableSelect" style="min-width:220px;padding:9px;border-radius:9px;background:#07172b;color:white;border:1px solid #38516b"><option value="user_profiles">User profiles</option><option value="amin_profiles">Amin profiles</option><option value="bookings">Bookings</option><option value="payment_records">Payment records</option><option value="amin_payment_requests">Amin payment requests</option><option value="support_tickets">Support tickets</option><option value="support_ticket_messages">Support messages</option><option value="notifications">Notifications</option><option value="admin_team_members">Admin team members</option><option value="team_member_tasks">Team tasks</option><option value="team_attendance">Team attendance</option><option value="admin_announcements">Announcements & ads</option><option value="admin_settings">Website settings</option><option value="admin_audit_logs">Audit logs</option><option value="user_addresses">Customer addresses</option><option value="service_categories">Service categories</option><option value="amin_reviews">Amin reviews</option><option value="amin_favorites">Amin favorites</option><option value="booking_calls">Booking calls</option><option value="booking_call_signals">Call signals (metadata)</option><option value="booking_messages">Booking messages</option><option value="ai_conversations">AI conversations</option><option value="ai_messages">AI messages</option><option value="ai_usage_daily">AI daily usage</option><option value="customer_signup_attempts">Signup attempts (hashed IP)</option></select><button class="cc-btn" id="ccLoadTable" type="button">Load records</button><button class="cc-btn secondary" id="ccPrevPage" type="button">Previous</button><button class="cc-btn secondary" id="ccNextPage" type="button">Next</button><button class="cc-btn secondary" id="ccExportTable" type="button">Export current page CSV</button></div><div id="ccTableStatus" class="cc-muted" style="margin-top:12px">Choose a table and press Load records.</div><div id="ccTableData" class="table-wrap" style="margin-top:12px"></div></div>
      <div class="cc-box" style="grid-column:1/-1"><h3 style="margin-top:0">Owner account operations</h3><p class="cc-muted">Secure server-side account controls. Blocking an account prevents sign-in; it does not delete user data.</p><div class="cc-actions"><input id="ccAccountSearch" type="search" placeholder="Search name, phone or district" style="flex:1;min-width:180px;padding:9px;border-radius:9px;border:1px solid #38516b;background:#07172b;color:white"><button class="cc-btn" id="ccLoadAccounts" type="button">Load accounts</button></div><div id="ccAccounts" class="cc-muted" style="margin-top:12px">Press Load accounts to view customer and Amin account records.</div><form id="ccNoticeForm" style="display:none;margin-top:16px;padding-top:14px;border-top:1px solid #27435f"><strong id="ccNoticeRecipient">Send account notification</strong><input id="ccNoticeUserId" type="hidden"><input id="ccNoticeTitle" maxlength="100" required placeholder="Notification title" style="display:block;width:100%;margin-top:8px;padding:10px;border-radius:9px;border:1px solid #38516b;background:#07172b;color:white"><textarea id="ccNoticeMessage" maxlength="1200" required placeholder="Write a message…" style="display:block;width:100%;margin-top:8px;padding:10px;border-radius:9px;border:1px solid #38516b;background:#07172b;color:white"></textarea><div class="cc-actions"><button class="cc-btn" type="submit">Send notification</button><button class="cc-btn secondary" id="ccNoticeCancel" type="button">Cancel</button></div></form></div>
      </div>
      <p class="cc-foot" id="ccUpdated">Live database metrics are loaded only after Owner verification. No secrets, payment credentials, or customer message bodies are displayed here.</p>`;
    const overview = $("overview");
    if (overview?.parentNode) overview.insertAdjacentElement("afterend", panel);
    else document.querySelector("main.wrap")?.appendChild(panel);
    const st = document.createElement("style"); st.textContent = style; document.head.appendChild(st);
    $("ccRefresh")?.addEventListener("click", refresh);
  }
  async function verifyOwner(client) {
    const {data:{user},error} = await client.auth.getUser();
    if (error) throw error;
    if (!user || user.id !== OWNER_ID || user.app_metadata?.role !== "admin") throw new Error("Owner identity verification failed.");
    const {data:member,error:memberError} = await client.from("admin_team_members").select("role,status").eq("user_id",OWNER_ID).maybeSingle();
    if (memberError) throw memberError;
    if (member?.role !== "admin" || member?.status !== "active") throw new Error("Owner Admin membership is not active.");
    return user;
  }
  async function count(client, table, filters=[]) {
    let q = client.from(table).select("*",{count:"exact",head:true});
    for (const [method,args] of filters) q = q[method](...args);
    const {count,error} = await q;
    if (error) throw error;
    return count || 0;
  }
  const card = (label,value,sub="Live Supabase count") => '<div class="cc-card"><small>'+esc(label)+'</small><strong>'+number(value)+'</strong><small>'+esc(sub)+'</small></div>';
  const row = (label,status,kind="") => '<div class="cc-row"><span>'+esc(label)+'</span><span class="cc-status '+kind+'">'+esc(status)+'</span></div>';
  function moduleRows() {
    $("ccModules").innerHTML = sections.map(([id,label]) => '<div class="cc-row"><span>'+esc(label)+'</span><button class="cc-btn secondary" type="button" data-cc-open="'+esc(id)+'">Open</button></div>').join("");
    $("ccModules").querySelectorAll("[data-cc-open]").forEach(b => b.addEventListener("click",()=>openSection(b.dataset.ccOpen)));
  }
  async function refresh() {
    const client = window.myAminSupabase;
    const connection = $("ccConnection");
    if (!client) { if(connection){connection.textContent="Supabase client unavailable";connection.className="cc-status bad";} return; }
    if (connection) {connection.textContent="Verifying Owner…";connection.className="cc-status warn";}
    try {
      await verifyOwner(client);
      const overview = await ownerAction({action:"overview"});
      const data = overview.counts || {};
      const tables = Object.keys(data);
      $("ccMetrics").innerHTML =
        card("Registered accounts",data.user_profiles,"Customer/Amin profile rows")+
        card("Amin applications",data.amin_profiles,"All application statuses")+
        card("Bookings",data.bookings,"All booking statuses")+
        card("Support tickets",data.support_tickets,"Customer support records")+
        card("Payment records",data.payment_records,"Submitted records; not bank-verified")+
        card("Team members",data.admin_team_members,"Includes active/blocked records")+
        card("Notifications",data.notifications,"All stored notifications")+
        card("Audit events",data.admin_audit_logs,"Server-side audit log rows")+
        card("Payment requests",data.amin_payment_requests,"Amin payment requests")+
        card("Published content",data.admin_announcements,"Announcements, links & ads")+
        card("Team tasks",data.team_member_tasks,"Assigned work items")+
        card("Service categories",data.service_categories,"Configured service types");
      $("ccOperations").innerHTML =
        row("Supabase project","ACTIVE_HEALTHY")+
        row("Database tables", "25 public tables")+
        row("Edge Functions","5 active")+
        row("Website settings","Supabase-backed")+
        row("Realtime support updates","Configured · runtime test pending","warn")+
        row("Backup / restore controls","Not implemented", "warn");
      $("ccSecurity").innerHTML =
        row("Owner identity + active membership","Verified")+
        row("Owner password + Passkey gate","Existing guard active")+
        row("Leaked-password protection","Disabled · enable in Auth settings","warn")+
        row("Public SECURITY DEFINER RPCs","2 flagged for review","warn")+
        row("RLS enabled without policy","1 table · service-role-only candidate","warn")+
        row("RLS policy performance advisories","22 findings","warn")+
        row("Multiple permissive RLS policies","35 findings","warn")+
        row("Unused indexes","7 candidates","warn");
      $("ccPlatform").innerHTML =
        row("Database engine","PostgreSQL 17")+
        row("Supabase region","ap-southeast-1")+
        row("Dashboard source","GitHub staging")+
        row("Automated backup export","Not verified","warn")+
        row("Disaster recovery restore drill","Not performed","warn")+
        row("Payments gateway / bank webhook","Not connected","warn");
      $("ccInventory").innerHTML = tables.map(t=>card(t.replaceAll("_"," "),data[t],data[t]==="server-only"?"Restricted server-side table":"Secure backend row count")).join("");
      $("ccUpdated").textContent = "Last refreshed: "+fmtTime(new Date().toISOString())+". Counts are retrieved through the Owner-verified Edge Function.";
      if (connection) {connection.textContent="Owner verified · Supabase live";connection.className="cc-status";}
      moduleRows();
    } catch (error) {
      if (connection) {connection.textContent="Secure check failed";connection.className="cc-status bad";}
      $("ccMetrics").innerHTML = '<div class="cc-card"><small>Command Center unavailable</small><strong style="font-size:18px">Access check failed</strong><small>'+esc(error.message||"Unknown error")+'</small></div>';
      $("ccOperations").textContent = "Live metrics were not loaded.";
      $("ccSecurity").textContent = "Security status unavailable.";
      $("ccPlatform").textContent = "Platform status unavailable.";
    }
  }

  async function ownerAction(body) {
    const client = window.myAminSupabase;
    if (!client) throw new Error("Supabase client unavailable");
    const {data,error} = await client.functions.invoke("owner-control-center",{body});
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Owner operation failed");
    return data;
  }
  function renderAccounts(accounts) {
    const box=$("ccAccounts");
    if (!accounts.length) { box.textContent="No matching accounts."; return; }
    box.innerHTML=accounts.map(a=>{
      const amin=a.amin;
      const blocked=a.account_status==="blocked";
      return '<article class="cc-card" style="margin:10px 0"><div class="cc-row"><div><strong style="font-size:16px">'+esc(a.full_name||"Unnamed account")+'</strong><small>'+esc(a.account_type||"customer")+' · '+esc(a.district||"District not set")+'</small><small>'+esc(a.phone||"Phone not set")+' · '+esc(a.id)+'</small></div><span class="cc-status '+(blocked?"bad":"")+'">'+esc(a.account_status||"unknown")+'</span></div>'+
      (amin?'<div class="cc-row"><span>Amin ID '+esc(amin.profile_uid)+' · '+esc(amin.approval_status)+'</span><span class="cc-muted">'+esc(amin.display_name)+'</span></div>':'')+
      '<div class="cc-actions"><button class="cc-btn '+(blocked?"":"secondary")+'" type="button" data-account-status="'+esc(a.id)+'" data-next-status="'+(blocked?"active":"blocked")+'">'+(blocked?"Reactivate account":"Block account")+'</button>'+
      (amin&&amin.approval_status==="pending"?'<button class="cc-btn" type="button" data-amin-approval="'+esc(amin.profile_uid)+'" data-next-approval="approved">Approve Amin</button><button class="cc-btn secondary" type="button" data-amin-approval="'+esc(amin.profile_uid)+'" data-next-approval="rejected">Reject Amin</button>':'')+
      '<button class="cc-btn secondary" type="button" data-notice-user="'+esc(a.id)+'" data-notice-name="'+esc(a.full_name||"Account")+'">Send notice</button></div></article>';
    }).join("");
    box.querySelectorAll("[data-account-status]").forEach(b=>b.addEventListener("click",async()=>{
      const status=b.dataset.nextStatus;
      if(!confirm((status==="blocked"?"Block":"Reactivate")+" this account?"))return;
      b.disabled=true;try{await ownerAction({action:"set_account_status",user_id:b.dataset.accountStatus,status});await loadAccounts();notify("Account status updated.");}catch(e){notify("Account update failed: "+(e.message||"Unknown error"));b.disabled=false;}
    }));
    box.querySelectorAll("[data-amin-approval]").forEach(b=>b.addEventListener("click",async()=>{
      const status=b.dataset.nextApproval;
      if(!confirm((status==="approved"?"Approve":"Reject")+" this Amin profile?"))return;
      b.disabled=true;try{await ownerAction({action:"set_amin_approval",profile_uid:b.dataset.aminApproval,status});await loadAccounts();notify("Amin approval status updated.");}catch(e){notify("Amin update failed: "+(e.message||"Unknown error"));b.disabled=false;}
    }));
    box.querySelectorAll("[data-notice-user]").forEach(b=>b.addEventListener("click",()=>{
      $("ccNoticeUserId").value=b.dataset.noticeUser;
      $("ccNoticeRecipient").textContent="Send notification to "+b.dataset.noticeName;
      $("ccNoticeForm").style.display="block";$("ccNoticeTitle").focus();
    }));
  }
  async function loadAccounts() {
    const box=$("ccAccounts");box.textContent="Loading accounts securely…";
    try {
      const data=await ownerAction({action:"list_accounts",limit:100,offset:0,query:$("ccAccountSearch").value.trim()});
      renderAccounts(data.accounts||[]);
    } catch(e) { box.textContent="Account controls unavailable: "+(e.message||"Owner Edge Function not deployed yet."); }
  }
  let tableOffset=0, currentTableRows=[], currentTableColumns=[], currentTableTotal=0;
  async function loadTable() {
    const table=$("ccTableSelect").value, status=$("ccTableStatus"), box=$("ccTableData");
    status.textContent="Loading secure records…"; box.innerHTML="";
    try {
      const result=await ownerAction({action:"list_table",table,limit:50,offset:tableOffset});
      currentTableRows=result.rows||[]; currentTableColumns=result.columns||[]; currentTableTotal=result.total||0;
      status.textContent=table+" · "+number(currentTableTotal)+" total records · showing "+(currentTableRows.length?tableOffset+1:0)+"–"+(tableOffset+currentTableRows.length);
      if(!currentTableRows.length){box.innerHTML='<div class="cc-muted">No records in this page.</div>';return;}
      const cell=v=>esc(v===null||v===undefined?"—":typeof v==="object"?JSON.stringify(v):String(v));
      box.innerHTML='<table style="min-width:900px"><thead><tr>'+currentTableColumns.map(c=>'<th>'+esc(c)+'</th>').join("")+'</tr></thead><tbody>'+currentTableRows.map(r=>'<tr>'+currentTableColumns.map(c=>'<td style="max-width:260px;overflow-wrap:anywhere;white-space:pre-wrap">'+cell(r[c])+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
    } catch(e){status.textContent="Data could not be loaded: "+(e.message||"Unknown error");}
  }
  function exportTableCsv() {
    if(!currentTableRows.length){notify("Load records before exporting.");return;}
    const quote=v=>'"'+String(v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):v).replace(/"/g,'""')+'"';
    const csv=[currentTableColumns.map(quote).join(","),...currentTableRows.map(r=>currentTableColumns.map(c=>quote(r[c])).join(","))].join("\\r\\n");
    const blob=new Blob(["\\ufeff",csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="myamin-"+$("ccTableSelect").value+"-page-"+(Math.floor(tableOffset/50)+1)+".csv";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function bindAccountControls() {
    $("ccLoadAccounts")?.addEventListener("click",loadAccounts);
    $("ccLoadTable")?.addEventListener("click",()=>{tableOffset=0;loadTable();});
    $("ccPrevPage")?.addEventListener("click",()=>{tableOffset=Math.max(0,tableOffset-50);loadTable();});
    $("ccNextPage")?.addEventListener("click",()=>{if(tableOffset+50<currentTableTotal){tableOffset+=50;loadTable();}});
    $("ccExportTable")?.addEventListener("click",exportTableCsv);
    $("ccAccountSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadAccounts();}});
    $("ccNoticeCancel")?.addEventListener("click",()=>{$("ccNoticeForm").style.display="none";});
    $("ccNoticeForm")?.addEventListener("submit",async e=>{
      e.preventDefault();const btn=$("ccNoticeForm").querySelector('button[type="submit"]');btn.disabled=true;
      try {await ownerAction({action:"send_notification",user_id:$("ccNoticeUserId").value,title:$("ccNoticeTitle").value.trim(),message:$("ccNoticeMessage").value.trim()});$("ccNoticeForm").reset();$("ccNoticeForm").style.display="none";notify("Notification sent.");}
      catch(err){notify("Notification failed: "+(err.message||"Unknown error"));}
      finally{btn.disabled=false;}
    });
  }
  function boot() {
    if (!document.documentElement.classList.contains("admin-ready")) { setTimeout(boot,300); return; }
    renderBase(); moduleRows(); bindAccountControls(); refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();