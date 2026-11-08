import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const SUPABASE_URL = "https://cxchbvygydfrtkdmkmpa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2xA7HmAgyn6Sr_kdpeTNZA_XIGBpZ-l";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: true } }
});
window.myAminSupabase = supabase;

const $ = (id) => document.getElementById(id);
// Keep internal authentication status out of the public page UI.
const hideAuthStatus = () => { const el = $("authStatus"); if (el) { el.hidden = true; el.style.display = "none"; el.setAttribute("aria-hidden", "true"); } };
hideAuthStatus();
const say = (id, message, error = false) => {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  el.style.color = error ? "#a12626" : "";
};
const fileExt = (file) => (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
const uploadPublicAsset = async (userId, kind, file) => {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("केवल JPG, PNG या WebP इमेज 5 MB तक अपलोड करें।");
  }
  const path = userId + "/" + kind + "-" + crypto.randomUUID() + "." + fileExt(file);
  const { error } = await supabase.storage.from("amin-assets").upload(path, file, {
    upsert: false, contentType: file.type, cacheControl: "3600"
  });
  if (error) throw error;
  return supabase.storage.from("amin-assets").getPublicUrl(path).data.publicUrl;
};
const profileId = (name) => {
  const first = (name.trim().split(/\s+/)[0] || "amin").toLowerCase().replace(/[^\p{L}\p{N}._-]/gu, "") || "amin";
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  return first + "@" + String(digits[0] % 100000000).padStart(8, "0");
};
const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
};
const renderPasskeyControls = (session) => {
  const panel = $("adminVerifiedPanel");
  if (!panel || !session?.user || session.user.app_metadata?.role !== "admin") return;
  if (panel.querySelector("#registerAdminPasskey")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "registerAdminPasskey";
  button.className = "btn btn-outline";
  button.textContent = "Enable Touch ID / Passkey for this Admin account";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      say("adminLoginMessage", "Passkey registered. Next time, use Touch ID / your device passkey to sign in.");
    } catch (e) {
      say("adminLoginMessage", e.message || "Passkey registration failed. Check Supabase Passkeys settings.", true);
    } finally { button.disabled = false; }
  });
  panel.appendChild(button);
};
const showAuthState = async (session) => {
  const box = $("authStatus");
  hideAuthStatus();
  if (!box) return;
  if (!session?.user) {
    box.textContent = "Secure account: signed out";
    if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
    renderPasskeyControls(null);
    return;
  }
  const { data: p, error: profileError } = await supabase.from("user_profiles")
    .select("full_name,account_type,phone,district,photo_url").eq("id", session.user.id).maybeSingle();
  if (profileError) throw profileError;
  const { data: a, error: aminError } = await supabase.from("amin_profiles")
    .select("profile_uid,display_name,phone,state,district,place,approval_status,photo_path,upi_id,upi_qr_path")
    .eq("user_id", session.user.id).maybeSingle();
  if (aminError) throw aminError;
  box.textContent = "Secure account: " + (p?.full_name || session.user.email) +
    " · " + (session.user.app_metadata?.role === "admin" ? "Admin / Owner" : (a ? "Amin" : "Customer"));
  if (a) {
    if ($("idName")) {
      $("idName").value = a.display_name || "";
      $("idNumber").value = a.profile_uid || "";
      $("idPhone").value = a.phone || "";
      $("idDistrict").value = (a.district || "") + ", " + (a.state || "");
      $("idUpiId").value = a.upi_id || "";
    }
    if ($("cardPhoto") && a.photo_path) {
      $("cardPhoto").src = a.photo_path;
      $("cardPhoto").style.display = "block";
      $("cardPhotoPlaceholder").style.display = "none";
    }
    if ($("cardUpiQr") && a.upi_qr_path) {
      $("cardUpiQr").src = a.upi_qr_path;
      $("cardUpiQr").hidden = false;
      $("cardUpiQrPlaceholder").hidden = true;
    }
    const local = {
      id: a.profile_uid, profileId: a.profile_uid, name: a.display_name,
      phone: a.phone, state: a.state, district: a.district, place: a.place,
      approved: a.approval_status === "approved", photo: a.photo_path || "",
      upiId: a.upi_id || "", upiQr: a.upi_qr_path || ""
    };
    localStorage.setItem("myamin_demo_logged_in_amin_v1", JSON.stringify(local));
    localStorage.removeItem("myamin_demo_user_v1");
    if (typeof window.refreshAminMenuProfile === "function") window.refreshAminMenuProfile();
  } else {
    localStorage.setItem("myamin_demo_user_v1", JSON.stringify({
      id: session.user.id, name: p?.full_name || session.user.user_metadata?.username || "Customer",
      username: session.user.user_metadata?.username || "",
      phone: p?.phone || session.user.phone || "", district: p?.district || "",
      photo: p?.photo_url || "", email: session.user.user_metadata?.username || ""
    }));
    localStorage.removeItem("myamin_demo_logged_in_amin_v1");
  }
  if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
  if (typeof window.updateBookingUser === "function") window.updateBookingUser();
  renderPasskeyControls(session);
};
const ensureCustomerFields = () => {
  const form = $("loginForm");
  if (!form || $("customerUsername")) return;
  const grid = form.querySelector(".form-grid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="field full"><label for="customerUsername">Username / यूज़रनेम</label><input id="customerUsername" type="text" autocomplete="username" maxlength="160" placeholder="Naitik Singh@7512" required></div>
    <div class="field full"><label for="customerPassword">Password / पासवर्ड</label><div class="password-wrap"><input id="customerPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required><button type="button" class="password-eye" data-target="customerPassword" aria-label="Show password">👁</button></div><small>कम-से-कम 8 characters.</small></div>`;
  const actions = form.querySelector(".form-actions");
  actions.innerHTML = '<button class="btn btn-green" type="submit">Create Account</button><button class="btn btn-outline" type="button" id="customerModeToggle">Already have an account? Login</button>';
  let mode = "signup";
  const toggle = $("customerModeToggle");
  toggle.addEventListener("click", () => {
    mode = mode === "signup" ? "login" : "signup";
    $("customerPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
    toggle.textContent = mode === "signup" ? "Already have an account? Login" : "Create a new account";
    form.querySelector('button[type="submit"]').textContent = mode === "signup" ? "Create Account" : "Login";
    form.dataset.authMode = mode;
  });
  form.dataset.authMode = "signup";
  form.querySelectorAll(".password-eye").forEach(btn => btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
    btn.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
  }));
};
const ensureAminFields = () => {
  const form = $("aminForm");
  if (!form || $("aminEmail")) return;
  const grid = form.querySelector(".form-grid");
  const html = document.createElement("div");
  html.className = "field";
  html.innerHTML = '<label for="aminEmail">Email / ईमेल *</label><input id="aminEmail" type="email" autocomplete="email" required><small>इसी ईमेल से आपका सुरक्षित अकाउंट खुलेगा।</small>';
  grid.prepend(html);
  const pass = document.createElement("div");
  pass.className = "field";
  pass.innerHTML = '<label for="aminPassword">Password / पासवर्ड *</label><input id="aminPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required><small>कम-से-कम 8 characters.</small>';
  grid.insertBefore(pass, grid.children[1] || null);
};
const customerAuthEmail = async (username) => {
  const key = username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const tag = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
  return tag + "@login.myamin.invalid";
};
const handleCustomerLogin = async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = $("loginForm");
  const mode = form.dataset.authMode || "signup";
  const username = $("customerUsername")?.value.normalize("NFKC").trim() || "";
  const password = $("customerPassword")?.value || "";
  if (!username || username.length > 160) {
    say("loginMessage", "Username खाली न छोड़ें और 160 characters से छोटा रखें।", true);
    return;
  }
  if (password.length < 8 || password.length > 72) {
    say("loginMessage", "Password कम-से-कम 8 characters का होना चाहिए।", true);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = mode === "signup" ? "Creating account…" : "Logging in…";
  try {
    const authEmail = await customerAuthEmail(username);
    if (mode === "signup") {
      const { data, error } = await supabase.functions.invoke("customer-signup", {
        body: { username, password }
      });
      if (error) {
        let detail = error.message || "Account create नहीं हो पाया।";
        try { const payload = await error.context?.json(); if (payload?.error) detail = payload.error; } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (loginError) throw loginError;
      if (!loginData?.session) throw new Error("Account बन गया, लेकिन login session नहीं मिला। उसी username से Login करें।");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("Login session verify नहीं हुआ।");
    localStorage.setItem("myamin_demo_user_v1", JSON.stringify({
      id: user.id,
      name: user.user_metadata?.username || username,
      username: user.user_metadata?.username || username,
      phone: "", district: "", photo: "", email: user.user_metadata?.username || username
    }));
    localStorage.removeItem("myamin_demo_logged_in_amin_v1");
    if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
    if (typeof window.updateBookingUser === "function") window.updateBookingUser();
    window.location.reload();
  } catch (e) {
    say("loginMessage", e.message || "Login पूरा नहीं हो सका।", true);
    button.disabled = false;
    button.textContent = mode === "signup" ? "Create Account" : "Login";
  }
};
const handleAminSignup = async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const name = $("regName").value.trim();
  const email = $("aminEmail").value.trim();
  const password = $("aminPassword").value;
  const phone = $("regPhone").value.trim();
  if (password.length < 8) { say("aminRegMessage", "पासवर्ड कम-से-कम 8 अक्षर का होना चाहिए।", true); return; }
  const submit = $("aminForm").querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    let data;
    const existing = await supabase.auth.getUser();
    if (existing.data?.user && existing.data.user.email?.toLowerCase() === email.toLowerCase()) {
      data = { user: existing.data.user, session: (await supabase.auth.getSession()).data.session };
    } else {
      const result = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: "https://naitiksingh7512-csk.github.io/MyAmin.com-/", data: { full_name: name, phone, account_type: "amin" } }
      });
      if (result.error) throw result.error;
      data = result.data;
    }
    if (!data.session || !data.user) {
      say("aminRegMessage", "अकाउंट बन गया। ईमेल verification पूरा करें, फिर Customer Login सेक्शन में उसी ईमेल/पासवर्ड से लॉगिन करें। उसके बाद Amin Registration दोबारा भरकर प्रोफ़ाइल सबमिट करें।");
      return;
    }
    const userId = data.user.id;
    const photo = await uploadPublicAsset(userId, "profile", $("regPhoto").files[0]);
    const upiQr = await uploadPublicAsset(userId, "upi-qr", $("regUpiQr").files[0]);
    const uid = profileId(name);
    const record = {
      user_id: userId, profile_uid: uid, display_name: name, phone,
      whatsapp: $("regWhatsApp").value.trim() || null,
      state: $("regState").value.trim(), district: $("regDistrict").value.trim(),
      place: $("regPlace").value.trim(),
      business_reference: $("regBusinessId").value.trim() || null,
      services: [], photo_path: photo, upi_id: $("regUpiId").value.trim() || null,
      upi_qr_path: upiQr, approval_status: "pending"
    };
    const { error: profileError } = await supabase.from("amin_profiles").upsert(record, { onConflict: "user_id" });
    if (profileError) throw profileError;
    await showAuthState(data.session);
    say("aminRegMessage", "Amin अकाउंट और ऑनलाइन प्रोफ़ाइल बन गई। Profile ID: " + uid + " · Status: Pending approval.");
  } catch (e) { say("aminRegMessage", e.message || "Amin registration असफल हुआ।", true); }
  finally { submit.disabled = false; }
};

const handleAdminLogin = async (event) => {
 event.preventDefault();event.stopImmediatePropagation();
 const button=$("adminLoginForm")?.querySelector('button[type="submit"]'),message=$("adminLoginMessage"),verified=$("adminVerifiedPanel");
 if(button)button.disabled=true;if(verified)verified.hidden=true;
 try{
  const username=$("adminEmail").value.trim(),password=$("adminPassword").value;
  if(!username)throw new Error("अपना Customer username भरें।");
  const email=await customerAuthEmail(username);
  const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
  const user=data.user,trustedRole=user?.app_metadata?.role==="admin";
  const {data:member,error:memberError}=await supabase.from("admin_team_members").select("role,status").eq("user_id",user.id).maybeSingle();if(memberError)throw memberError;
  if(!trustedRole||member?.role!=="admin"||member?.status!=="active"){await supabase.auth.signOut();throw new Error("यह account Admin के रूप में verified नहीं है।");}
  if(message){message.textContent="Admin verification successful · Owner access active.";message.style.display="block";message.style.color="";}
  if(verified)verified.hidden=false;renderPasskeyControls(data.session);
 }catch(e){if(message){message.textContent=e.message||"Admin login असफल हुआ।";message.style.display="block";message.style.color="#a12626";}}
 finally{if(button)button.disabled=false;}
};

const verifyAdminOAuthSession = async (session) => {
  const message = $("adminLoginMessage");
  const panel = $("adminVerifiedPanel");
  try {
    const user = session?.user || await currentUser();
    const { data: membership, error } = await supabase.from("admin_team_members")
      .select("role,status").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (user.app_metadata?.role !== "admin" || membership?.role !== "admin" || membership?.status !== "active") {
      await supabase.auth.signOut();
      throw new Error("This Google account is not approved as an administrator.");
    }
    if (message) { message.textContent = "Google Admin verification successful."; message.style.display = "block"; message.style.color = ""; }
    if (panel) panel.hidden = false;
    renderPasskeyControls(session);
    sessionStorage.removeItem("myamin_admin_google_pending");
  } catch (e) {
    if (message) { message.textContent = e.message || "Admin verification failed."; message.style.display = "block"; message.style.color = "#a12626"; }
    sessionStorage.removeItem("myamin_admin_google_pending");
  }
};
const addGoogleLoginButtons = () => {
  const add = (formId, admin = false) => {
    const form = $(formId);
    if (!form || form.querySelector(".myamin-google-login")) return;
    const target = form.querySelector(".form-actions") || form;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-outline myamin-google-login";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.gap = "10px";
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20" focusable="false"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.3A20 20 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.8 27.7a12 12 0 0 1 0-7.4V15H5.9a20 20 0 0 0 0 18z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 6 29.5 4 24 4A20 20 0 0 0 5.9 15l6.9 5.3c1.6-4.7 6-8.2 11.2-8.2z"/></svg><span>' + (admin ? "Continue with Google · Admin" : "Continue with Google") + '</span>';
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (admin) sessionStorage.setItem("myamin_admin_google_pending", "1");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: "https://naitiksingh7512-csk.github.io/MyAmin.com-/", queryParams: { prompt: "select_account" } }
        });
        if (error) throw error;
      } catch (e) {
        sessionStorage.removeItem("myamin_admin_google_pending");
        say(admin ? "adminLoginMessage" : "loginMessage", e.message || "Google login could not start.", true);
        button.disabled = false;
      }
    });
    target.appendChild(button);
  };
  add("adminLoginForm", true);
  const adminForm = $("adminLoginForm");
  if (adminForm && !adminForm.querySelector(".myamin-passkey-login")) {
    const passkey = document.createElement("button");
    passkey.type = "button";
    passkey.className = "btn btn-outline myamin-passkey-login";
    passkey.textContent = "Sign in with Touch ID / Passkey";
    passkey.addEventListener("click", async () => {
      passkey.disabled = true;
      try {
        const { data, error } = await supabase.auth.signInWithPasskey();
        if (error) throw error;
        await verifyAdminOAuthSession(data.session);
      } catch (e) {
        say("adminLoginMessage", e.message || "Passkey sign-in failed.", true);
      } finally { passkey.disabled = false; }
    });
    (adminForm.querySelector(".form-actions") || adminForm).appendChild(passkey);
  }
};

const syncAdminAccessUI = async (session) => {
  const quickLink = $("quickAdminLogin");
  const panel = $("adminVerifiedPanel");
  let isActiveAdmin = false;
  if (session?.user?.app_metadata?.role === "admin") {
    const { data: membership, error } = await supabase.from("admin_team_members")
      .select("role,status").eq("user_id", session.user.id).maybeSingle();
    isActiveAdmin = !error && membership?.role === "admin" && membership?.status === "active";
  }
  if (quickLink) quickLink.hidden = isActiveAdmin;
  if (panel) panel.hidden = !isActiveAdmin;
  if (isActiveAdmin) renderPasskeyControls(session);
};
const handleBooking = async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const user = await currentUser();
    const selected = $("bookingAmin").value.trim();
    let aminId = null;
    if (selected) {
      const { data, error } = await supabase.from("amin_profiles")
        .select("user_id,profile_uid,display_name")
        .eq("approval_status", "approved");
      if (error) throw error;
      const match = (data || []).find(a =>
        String(a.profile_uid || "").toLowerCase() === selected.toLowerCase() ||
        String(a.display_name || "").trim().toLowerCase() === selected.toLowerCase()
      );
      aminId = match?.user_id || null;
    }
    const payload = {
      customer_user_id: user.id, amin_user_id: aminId,
      service: $("bookingService").value, state: $("bookingState").value.trim(),
      district: $("bookingDistrict").value.trim(), place: $("bookingPlace").value.trim(),
      preferred_date: $("bookingDate").value,
      preferred_time: $("bookingPreferredTime").value || null,
      details: $("bookingDetails").value.trim() || null
    };
    const { error } = await supabase.from("bookings").insert(payload);
    if (error) throw error;
    say("bookingMessage", aminId
      ? "आपकी Booking Database में सेव हो गई और चुने गए Amin को assign कर दी गई है।"
      : "Booking Database में सेव हो गई। Amin match नहीं हुआ, इसलिए Admin इसे assign कर सकता है।");
    $("bookingForm").reset();
    if (typeof window.refreshBookings === "function") await window.refreshBookings();
    if ($("customerAccountDialog")?.classList.contains("show") && typeof window.openCustomerAccount === "function") await window.openCustomerAccount();
  } catch (e) { say("bookingMessage", e.message || "Booking जमा नहीं हुई। कृपया पहले Login करें।", true); }
};
window.logout = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("myamin_demo_user_v1");
  localStorage.removeItem("myamin_demo_logged_in_amin_v1");
  if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
  if (typeof window.updateBookingUser === "function") window.updateBookingUser();
  say("loginMessage", "आप सुरक्षित रूप से Logout हो गए।");
};
document.addEventListener("DOMContentLoaded", () => {
  ensureCustomerFields();
  ensureAminFields();
  $("loginForm")?.addEventListener("submit", handleCustomerLogin, true);
  $("aminForm")?.addEventListener("submit", handleAminSignup, true);
  $("bookingForm")?.addEventListener("submit", handleBooking, true);
  $("adminLoginForm")?.addEventListener("submit", handleAdminLogin, true);
  $("loginForm")?.querySelector('button[onclick="logout()"]')?.addEventListener("click", window.logout);
});
const { data: initial } = await supabase.auth.getSession();
await showAuthState(initial.session);
await syncAdminAccessUI(initial.session);
if (sessionStorage.getItem("myamin_admin_google_pending") === "1" && initial.session) {
  await verifyAdminOAuthSession(initial.session);
}
supabase.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(async () => {
    await showAuthState(session);
    await syncAdminAccessUI(session);
    if (sessionStorage.getItem("myamin_admin_google_pending") === "1" && session) {
      await verifyAdminOAuthSession(session);
    }
  });
});

window.refreshBookings = async () => {
  const box = $("myBookings");
  if (!box) return;
  try {
    const user = await currentUser();
    const { data, error } = await supabase.from("bookings")
      .select("id,service,state,district,place,preferred_date,preferred_time,status,confirmed_date,confirmed_time,created_at")
      .eq("customer_user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) { box.innerHTML = "<p>अभी कोई ऑनलाइन Booking नहीं है।</p>"; return; }
    box.innerHTML = data.map(b => {
      const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
      return '<div class="list-item"><strong>' + safe(b.service) + '</strong><p>Booking: ' + safe(b.id) +
        '<br>Location: ' + safe(b.place) + ', ' + safe(b.district) + ', ' + safe(b.state) +
        '<br>Date: ' + safe(b.preferred_date) + ' · ' + safe(b.preferred_time || "Any time") +
        '<br>Status: ' + safe(b.status) + '</p></div>';
    }).join("");
  } catch (e) { box.textContent = e.message || "Booking list load नहीं हुई।"; }
};
