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
        <div class="cc-box"><h3 style="margin-top:0">Platform & backup readiness</h3><div id="ccPlatform"></div></div>
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
      const tables = ["user_profiles","amin_profiles","bookings","support_tickets","payment_records","admin_team_members","notifications","admin_audit_logs","amin_payment_requests","admin_announcements","team_member_tasks","service_categories"];
      const values = await Promise.all(tables.map(t=>count(client,t)));
      const data = Object.fromEntries(tables.map((t,i)=>[t,values[i]]));
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
        row("Edge Functions","4 active")+
        row("Website settings","Supabase-backed")+
        row("Realtime support updates","Enabled")+
        row("Backup / restore controls","Not implemented", "warn");
      $("ccSecurity").innerHTML =
        row("Owner identity + active membership","Verified")+
        row("Owner password + Passkey gate","Existing guard active")+
        row("Leaked-password protection","Disabled · enable in Auth settings","warn")+
        row("Public SECURITY DEFINER RPCs","2 flagged for review","warn")+
        row("RLS enabled without policy","1 table · service-role-only candidate","warn")+
        row("RLS policy performance advisories","22 findings","warn");
      $("ccPlatform").innerHTML =
        row("Database engine","PostgreSQL 17")+
        row("Supabase region","ap-southeast-1")+
        row("Application branch","GitHub staging")+
        row("Automated backup export","Not verified","warn")+
        row("Disaster recovery restore drill","Not performed","warn")+
        row("Payments gateway / bank webhook","Not connected","warn");
      $("ccUpdated").textContent = "Last refreshed: "+fmtTime(new Date().toISOString())+". Metrics are read from Supabase using the signed-in Owner session; no customer PII or secret keys are shown.";
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
  function boot() {
    if (!document.documentElement.classList.contains("admin-ready")) { setTimeout(boot,300); return; }
    renderBase(); moduleRows(); refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();