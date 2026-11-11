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
let supportRealtimeChannel = null;
let supportRealtimeUserId = "";
const syncSupportRealtime = async (user) => {
  const userId = user?.id || "";
  if (userId === supportRealtimeUserId) return;
  if (supportRealtimeChannel) {
    await supabase.removeChannel(supportRealtimeChannel);
    supportRealtimeChannel = null;
  }
  supportRealtimeUserId = userId;
  if (!userId) return;
  supportRealtimeChannel = supabase.channel("myamin-support-" + userId)
    .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: "user_id=eq." + userId }, () => {
      if (typeof window.loadMySupportTickets === "function") window.loadMySupportTickets();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages" }, () => {
      if (typeof window.loadMySupportTickets === "function") window.loadMySupportTickets();
    })
    .subscribe();
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
      // Registration completed through the device's biometric/passkey prompt.
      sessionStorage.setItem("myamin_admin_passkey_verified", session.user.id + ":" + Date.now());
      const details = $("adminVerifiedDetails");
      if (details) details.hidden = false;
      say("adminLoginMessage", "Touch ID / Passkey सफलतापूर्वक register हो गई। Admin Dashboard खुल रहा है…");
      setTimeout(() => { window.location.href = "ma-control-9f2c7a61b4e8.html"; }, 700);
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
    await syncSupportRealtime(null);
    box.textContent = "Secure account: signed out";
    if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
    renderPasskeyControls(null);
    return;
  }

  // A missing/temporarily unreadable profile row must not stop the customer
  // menu from rendering the signed-in user's name and saved avatar.
  let p = null;
  try {
    const result = await supabase.from("user_profiles")
      .select("full_name,account_type,phone,district,photo_url,account_status")
      .eq("id", session.user.id).maybeSingle();
    if (result.error) throw result.error;
    p = result.data || null;
  } catch (error) {
    console.warn("My Amin customer profile lookup:", error.message || error);
  }

  let a = null;
  try {
    const result = await supabase.from("amin_profiles")
      .select("profile_uid,display_name,phone,whatsapp,state,district,place,business_reference,experience,services,instagram_url,facebook_url,youtube_url,approval_status,account_status,photo_path,upi_id,upi_qr_path")
      .eq("user_id", session.user.id).maybeSingle();
    if (result.error) throw result.error;
    a = result.data || null;
  } catch (error) {
    console.warn("My Amin Amin profile lookup:", error.message || error);
  }

  if (p?.account_status === "blocked" || p?.account_status === "deleted" || a?.account_status === "blocked" || a?.account_status === "deleted") {
    await supabase.auth.signOut();
    await syncSupportRealtime(null);
    box.textContent = "This account is blocked or inactive. Contact My Amin support.";
    if (typeof window.refreshCustomerMenuProfile === "function") window.refreshCustomerMenuProfile();
    return;
  }

  await syncSupportRealtime(session.user);
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
      id: a.profile_uid, profileId: a.profile_uid, userId: session.user.id, name: a.display_name,
      phone: a.phone, whatsapp: a.whatsapp || "", state: a.state, district: a.district, place: a.place,
      businessId: a.business_reference || "", description: a.experience || "", services: a.services || [],
      instagram: a.instagram_url || "", facebook: a.facebook_url || "", youtube: a.youtube_url || "",
      approved: a.approval_status === "approved", photo: a.photo_path || "",
      upiId: a.upi_id || "", upiQr: a.upi_qr_path || ""
    };
    localStorage.setItem("myamin_demo_logged_in_amin_v1", JSON.stringify(local));
    localStorage.removeItem("myamin_demo_user_v1");
    if (typeof window.refreshAminMenuProfile === "function") window.refreshAminMenuProfile();
  } else {
    const meta = session.user.user_metadata || {};
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem("myamin_demo_user_v1") || "{}"); } catch {}
    const emailName = (session.user.email || "").split("@")[0];
    const username = meta.username || meta.name || meta.full_name || previous.username || emailName || "";
    localStorage.setItem("myamin_demo_user_v1", JSON.stringify({
      id: session.user.id,
      name: p?.full_name || meta.full_name || meta.name || meta.username || previous.name || previous.username || emailName || "Customer",
      username,
      phone: p?.phone || meta.phone || session.user.phone || previous.phone || "",
      district: p?.district || meta.district || previous.district || "",
      photo: p?.photo_url || meta.avatar_url || meta.photo_url || previous.photo || "",
      email: session.user.email || username || ""
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
    const usernameLabel = form.querySelector('label[for="customerUsername"]');
    if (usernameLabel) usernameLabel.textContent = mode === "signup" ? "Username / यूज़रनेम" : "Username or Amin Email / यूज़रनेम या Amin Email";
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
    const authEmail = mode === "login" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) ? username.toLowerCase() : await customerAuthEmail(username);
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
      name: user.user_metadata?.username || user.user_metadata?.full_name || (username.includes("@") ? username.split("@")[0] : username),
      username: user.user_metadata?.username || user.user_metadata?.full_name || (username.includes("@") ? username.split("@")[0] : username),
      phone: user.user_metadata?.phone || "", district: "", photo: "",
      email: user.user_metadata?.username || user.user_metadata?.full_name || (username.includes("@") ? username.split("@")[0] : username)
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
      say("aminRegMessage", "अकाउंट बन गया। ईमेल verification पूरा करें। फिर Customer Login में Username की जगह अपना registered Amin email और वही password डालकर Login करें। उसके बाद Amin Registration दोबारा भरकर प्रोफ़ाइल सबमिट करें।");
      return;
    }
    const userId = data.user.id;
    const { data: previousProfile, error: previousError } = await supabase.from("amin_profiles")
      .select("profile_uid,approval_status,photo_path,upi_id,upi_qr_path,services,experience,instagram_url,facebook_url,youtube_url")
      .eq("user_id", userId).maybeSingle();
    if (previousError) throw previousError;
    const photo = await uploadPublicAsset(userId, "profile", $("regPhoto").files[0]) || previousProfile?.photo_path || null;
    const upiQr = await uploadPublicAsset(userId, "upi-qr", $("regUpiQr").files[0]) || previousProfile?.upi_qr_path || null;
    const uid = previousProfile?.profile_uid || profileId(name);
    const services = Array.from(new Set(($("regServices")?.value || "").split(",").map(value => value.trim()).filter(Boolean))).slice(0, 20);
    if (services.some(value => value.length > 80)) throw new Error("हर सेवा का नाम 80 अक्षरों से छोटा रखें।");
    const record = {
      user_id: userId, profile_uid: uid, display_name: name, phone,
      whatsapp: $("regWhatsApp").value.trim() || null,
      state: $("regState").value.trim(), district: $("regDistrict").value.trim(),
      place: $("regPlace").value.trim(),
      business_reference: $("regBusinessId").value.trim() || null,
      experience: $("regDescription").value.trim() || previousProfile?.experience || null,
      services: services.length ? services : (previousProfile?.services || []), photo_path: photo,
      upi_id: $("regUpiId").value.trim() || previousProfile?.upi_id || null,
      upi_qr_path: upiQr,
      instagram_url: $("regInstagram").value.trim() || null,
      facebook_url: $("regFacebook").value.trim() || null,
      youtube_url: $("regYouTube").value.trim() || null,
      approval_status: previousProfile?.approval_status || "pending"
    };
    if (previousProfile) {
      const { data: updated, error: profileError } = await supabase.functions.invoke("admin-team", { body: {
        action: "update_amin_profile", display_name: name, phone,
        whatsapp: $("regWhatsApp").value.trim(), state: $("regState").value.trim(),
        district: $("regDistrict").value.trim(), place: $("regPlace").value.trim(),
        business_reference: $("regBusinessId").value.trim(), experience: $("regDescription").value.trim(), services, photo_path: photo,
        upi_id: $("regUpiId").value.trim() || previousProfile.upi_id, upi_qr_path: upiQr,
        instagram_url: $("regInstagram").value.trim(),
        facebook_url: $("regFacebook").value.trim(),
        youtube_url: $("regYouTube").value.trim()
      }});
      if (profileError) throw profileError;
      if (!updated?.success) throw new Error(updated?.error || "Amin profile update failed.");
    } else {
      const { error: profileError } = await supabase.from("amin_profiles").insert(record);
      if (profileError) throw profileError;
    }
    await showAuthState(data.session);
    // Prepare the linked Amin ID card from the newly saved server profile.
    if ($("idName")) $("idName").value = name;
    if ($("idNumber")) $("idNumber").value = uid;
    if ($("idRole") && !$("idRole").value.trim()) $("idRole").value = "Land Measurement Service";
    if ($("idForm")) $("idForm").requestSubmit();
    say("aminRegMessage", "Amin profile saved. Profile ID: " + uid + " · Status: " + (previousProfile?.approval_status || "pending") + ".");
  } catch (e) { say("aminRegMessage", e.message || "Amin registration असफल हुआ।", true); }
  finally { submit.disabled = false; }
};

const OWNER_ADMIN_USER_ID = "24dd2630-4624-46ee-8c54-37b9dc8fcd64";

const handleAdminLogin = async (event) => {
 event.preventDefault();event.stopImmediatePropagation();
 const button=$("adminLoginForm")?.querySelector('button[type="submit"]'),message=$("adminLoginMessage"),verified=$("adminVerifiedPanel");
 if(button)button.disabled=true;if(verified)verified.hidden=true;const verifiedDetails=$("adminVerifiedDetails");if(verifiedDetails)verifiedDetails.hidden=true;
 try{
  const username=$("adminEmail").value.trim(),password=$("adminPassword").value;
  if(!username)throw new Error("अपना Customer username भरें।");
  const email=await customerAuthEmail(username);
  const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
  const user=data.user;
  if(user?.id!==OWNER_ADMIN_USER_ID){await supabase.auth.signOut();throw new Error("यह Admin verification केवल Owner account Naitiksingh@7512-csk के लिए उपलब्ध है।");}
  const trustedRole=user?.app_metadata?.role==="admin";
  const {data:member,error:memberError}=await supabase.from("admin_team_members").select("role,status").eq("user_id",user.id).maybeSingle();if(memberError)throw memberError;
  if(!trustedRole||member?.role!=="admin"||member?.status!=="active"){await supabase.auth.signOut();throw new Error("यह account Admin के रूप में verified नहीं है।");}
  const { data: savedPasskeys, error: passkeyListError } = await supabase.auth.passkey.list();
  if (passkeyListError) throw passkeyListError;
  if (!savedPasskeys?.length) {
    if (message) { message.textContent = "Password verified. अब इसी account के लिए Touch ID / Passkey register करें।"; message.style.display = "block"; message.style.color = ""; }
    if (verified) verified.hidden = false;
    renderPasskeyControls(data.session);
    return;
  }
  if (message) { message.textContent = "Password verified. अब दूसरी सुरक्षा जाँच के लिए Touch ID / Passkey confirm करें।"; message.style.display = "block"; message.style.color = ""; }
  const { data: biometricData, error: biometricError } = await supabase.auth.signInWithPasskey();
  if (biometricError) throw biometricError;
  if (biometricData.user?.id !== user.id) {
    await supabase.auth.signOut();
    throw new Error("Passkey दूसरे account की है। उसी Admin Owner account की Passkey इस्तेमाल करें।");
  }
  const { data: activeMember, error: activeMemberError } = await supabase.from("admin_team_members").select("role,status").eq("user_id", user.id).maybeSingle();
  if (activeMemberError) throw activeMemberError;
  if (biometricData.user?.app_metadata?.role !== "admin" || activeMember?.role !== "admin" || activeMember?.status !== "active") {
    await supabase.auth.signOut();
    throw new Error("Passkey के बाद Admin verification असफल हुआ।");
  }
  sessionStorage.setItem("myamin_admin_passkey_verified", user.id + ":" + Date.now());
  if (message) { message.textContent = "Password और Touch ID / Passkey verified हैं। Admin Dashboard खोल सकते हैं।"; message.style.display = "block"; message.style.color = ""; }
  if (verified) verified.hidden = false;
  if (verifiedDetails) verifiedDetails.hidden = false;
  setTimeout(() => { window.location.href = "ma-control-9f2c7a61b4e8.html"; }, 700);
 }catch(e){if(message){message.textContent=e.message||"Admin login असफल हुआ।";message.style.display="block";message.style.color="#a12626";}}
 finally{if(button)button.disabled=false;}
};

const verifyAdminOAuthSession = async (session) => {
  const message = $("adminLoginMessage");
  const panel = $("adminVerifiedPanel");
  try {
    const user = session?.user || await currentUser();
    if (user?.id !== OWNER_ADMIN_USER_ID) {
      await supabase.auth.signOut();
      throw new Error("Admin verification is restricted to the Owner account Naitiksingh@7512-csk.");
    }
    const { data: membership, error } = await supabase.from("admin_team_members")
      .select("role,status").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (user.app_metadata?.role !== "admin" || membership?.role !== "admin" || membership?.status !== "active") {
      await supabase.auth.signOut();
      throw new Error("This Google account is not approved as an administrator.");
    }
    if (message) { message.textContent = "Google Admin verification successful."; message.style.display = "block"; message.style.color = ""; }
    // OAuth sign-in alone must never reveal the verified dashboard panel.
    if (panel) panel.hidden = true;
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

};

const syncAdminAccessUI = async (session) => {
  const quickLink = $("quickAdminLogin");
  const panel = $("adminVerifiedPanel");
  // A signed-in admin session alone is NOT proof of the required password + passkey step.
  // Keep the dashboard link hidden until handleAdminLogin completes both checks.
  if (quickLink) quickLink.hidden = true;
  if (panel) panel.hidden = true;
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
  sessionStorage.removeItem("myamin_admin_passkey_verified");
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
  // Persist website reports as secure support tickets in Supabase.
  const reportForm = $("reportForm");
  if (reportForm) {
    reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const button = reportForm.querySelector('button[type="submit"]');
      const message = $("reportMessage");
      const title = $("reportTitle")?.value.trim() || "";
      const details = $("reportDetails")?.value.trim() || "";
      const kind = $("reportType")?.value || "Other";
      if (!title || !details) { say("reportMessage", "कृपया शीर्षक और पूरी जानकारी भरें।", true); return; }
      if (button) { button.disabled = true; button.textContent = "रिपोर्ट भेजी जा रही है…"; }
      try {
        const user = await currentUser();
        if (!user) throw new Error("रिपोर्ट भेजने के लिए पहले Customer Login करें।");
        const { error } = await supabase.from("support_tickets").insert({
          user_id: user.id,
          subject: "[" + kind + "] " + title.slice(0, 180),
          description: details.slice(0, 8000),
          priority: kind === "Security Concern" ? "high" : "normal",
          status: "open"
        });
        if (error) throw error;
        reportForm.reset();
        say("reportMessage", "रिपोर्ट Supabase में सुरक्षित सेव हो गई है। Admin/Support टीम इसे देख सकती है।");
        if (typeof window.loadMySupportTickets === "function") await window.loadMySupportTickets();
      } catch (error) {
        say("reportMessage", error.message || "रिपोर्ट भेजी नहीं जा सकी।", true);
      } finally {
        if (button) { button.disabled = false; button.textContent = "रिपोर्ट सेव करें"; }
      }
    });
  }
  $("adminLoginForm")?.addEventListener("submit", handleAdminLogin, true);

  $("loginForm")?.querySelector('button[onclick="logout()"]')?.addEventListener("click", window.logout);
});
const safeUi = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
window.loadMySupportTickets = async () => {
  const box = $("mySupportTickets"); if (!box) return;
  try {
    const user = await currentUser(); if (!user) { box.textContent = "Login to view support conversations."; return; }
    const { data: tickets, error } = await supabase.from("support_tickets").select("id,subject,description,status,priority,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    if (!tickets?.length) { box.textContent = "No support conversations yet."; return; }
    const ids = tickets.map(t => t.id);
    const { data: messages, error: messageError } = await supabase.from("support_ticket_messages").select("id,ticket_id,sender_user_id,message,created_at").in("ticket_id", ids).order("created_at", { ascending: true });
    if (messageError) throw messageError;
    box.innerHTML = tickets.map(t => {
      const thread = (messages || []).filter(m => m.ticket_id === t.id);
      return '<article class="list-item"><strong>' + safeUi(t.subject) + '</strong><small> · ' + safeUi(t.status) + ' · ' + safeUi(new Date(t.created_at).toLocaleString()) + '</small><p>' + safeUi(t.description) + '</p><div style="max-height:220px;overflow:auto">' + thread.map(m => '<div style="padding:8px;margin:6px 0;border-radius:8px;background:' + (m.sender_user_id === user.id ? '#edf6f0' : '#f3f4f6') + '"><small>' + (m.sender_user_id === user.id ? 'You' : 'My Amin Support') + ' · ' + safeUi(new Date(m.created_at).toLocaleString()) + '</small><div style="white-space:pre-wrap">' + safeUi(m.message) + '</div></div>').join("") + '</div>' + (["resolved","closed"].includes(t.status) ? '<small>This conversation is closed. Submit a new report if you need more help.</small>' : '<form data-customer-ticket-reply="' + safeUi(t.id) + '" style="margin-top:10px"><textarea name="message" maxlength="4000" required rows="2" placeholder="Reply to support…"></textarea><button class="btn btn-green" type="submit">Send reply</button></form>') + '</article>';
    }).join("");
    box.querySelectorAll("[data-customer-ticket-reply]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault(); const target = e.currentTarget, button = target.querySelector("button"), message = target.elements.message.value.trim();
      if (!message) return; button.disabled = true;
      try { const { error } = await supabase.from("support_ticket_messages").insert({ ticket_id: target.dataset.customerTicketReply, sender_user_id: user.id, message }); if (error) throw error; await window.loadMySupportTickets(); }
      catch (err) { alert("Reply failed: " + (err.message || "Unknown error")); button.disabled = false; }
    }));
  } catch (e) { box.textContent = "Support conversations unavailable: " + (e.message || "Unknown error"); }
};
window.loadCustomerAddresses = async () => {
  const box = $("customerAddressList"); if (!box) return;
  try {
    const user = await currentUser(); if (!user) { box.textContent = "Login to manage saved addresses."; return; }
    const { data, error } = await supabase.from("user_addresses").select("id,label,address_line,state,district,pincode,is_default").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    box.innerHTML = data?.length ? data.map(a => '<div class="list-item"><strong>' + safeUi(a.label) + (a.is_default ? ' · Default' : '') + '</strong><p>' + safeUi(a.address_line) + '<br>' + safeUi([a.district,a.state,a.pincode].filter(Boolean).join(", ")) + '</p></div>').join("") : '<p>No saved addresses yet.</p>';
    const preferred = (data || []).find(a => a.is_default) || data?.[0];
    if (preferred) { if ($("bookingState") && !$("bookingState").value.trim()) $("bookingState").value = preferred.state; if ($("bookingDistrict") && !$("bookingDistrict").value.trim()) $("bookingDistrict").value = preferred.district; if ($("bookingPlace") && !$("bookingPlace").value.trim()) $("bookingPlace").value = preferred.address_line; }
  } catch (e) { box.textContent = "Saved addresses unavailable: " + (e.message || "Unknown error"); }
};
$("customerAddressForm")?.addEventListener("submit", async e => {
  e.preventDefault(); const button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const user = await currentUser(); if (!user) throw new Error("Please sign in first.");
    const isDefault = $("addressDefault").checked;
    if (isDefault) { const { error: clearError } = await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id); if (clearError) throw clearError; }
    const { error } = await supabase.from("user_addresses").insert({ user_id: user.id, label: $("addressLabel").value, address_line: $("addressLine").value.trim(), state: $("addressState").value.trim(), district: $("addressDistrict").value.trim(), pincode: $("addressPincode").value.trim() || null, is_default: isDefault });
    if (error) throw error; e.currentTarget.reset(); $("addressState").value = "Bihar"; await window.loadCustomerAddresses();
  } catch (err) { alert("Address could not be saved: " + (err.message || "Unknown error")); }
  finally { button.disabled = false; }
});
async function loadPublicServiceCategories() {
  const select = $("bookingService"); if (!select) return;
  try {
    const { data, error } = await supabase.from("service_categories").select("slug,name_en,name_hi,is_active,sort_order").eq("is_active", true).order("sort_order", { ascending: true });
    if (error) throw error;
    const hi = (localStorage.getItem("myamin_language") || "en") === "hi";
    select.innerHTML = '<option value="">सेवा चुनें / Choose a service</option>' + (data || []).map(x => '<option value="' + safeUi(x.name_en) + '">' + safeUi(hi ? x.name_hi : x.name_en) + '</option>').join("");
  } catch (e) { console.warn("Service categories:", e.message || e); }
}
$("languageBtn")?.addEventListener("click", () => { setTimeout(loadPublicServiceCategories, 0); });
const { data: initial } = await supabase.auth.getSession();
await showAuthState(initial.session);
await syncAdminAccessUI(initial.session);
await loadPublicServiceCategories();
await window.loadMySupportTickets();
await window.loadCustomerAddresses();
if (typeof window.renderAdminContentFeed === "function") await window.renderAdminContentFeed();
if (typeof window.applyLocalWebsiteSettings === "function") await window.applyLocalWebsiteSettings();
if (typeof window.loadAmins === "function") await window.loadAmins();
if (typeof window.openQrAminProfile === "function") await window.openQrAminProfile();
if (sessionStorage.getItem("myamin_admin_google_pending") === "1" && initial.session) {
  await verifyAdminOAuthSession(initial.session);
}
supabase.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(async () => {
    await showAuthState(session);
    await syncAdminAccessUI(session);
    await window.loadMySupportTickets();
    await window.loadCustomerAddresses();
    if (typeof window.renderAdminContentFeed === "function") await window.renderAdminContentFeed();
    if (typeof window.applyLocalWebsiteSettings === "function") await window.applyLocalWebsiteSettings();
    if (typeof window.loadAmins === "function") await window.loadAmins();
    if (typeof window.openQrAminProfile === "function") await window.openQrAminProfile();
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
