import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const SUPABASE_URL = "https://cxchbvygydfrtkdmkmpa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2xA7HmAgyn6Sr_kdpeTNZA_XIGBpZ-l";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.myAminSupabase = supabase;

const $ = (id) => document.getElementById(id);
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
const showAuthState = async (session) => {
  const box = $("authStatus");
  if (!box) return;
  if (!session?.user) {
    box.textContent = "Secure account: signed out";
    return;
  }
  const { data: p } = await supabase.from("user_profiles")
    .select("full_name,account_type").eq("id", session.user.id).maybeSingle();
  box.textContent = "Secure account: " + (p?.full_name || session.user.email) +
    " · " + (p?.account_type === "amin" ? "Amin" : "Customer");
  if (p?.account_type === "amin") {
    const { data: a } = await supabase.from("amin_profiles")
      .select("profile_uid,display_name,phone,state,district,place,approval_status,photo_path,upi_id,upi_qr_path")
      .eq("user_id", session.user.id).maybeSingle();
    if (a) {
      const local = {
        id: a.profile_uid, profileId: a.profile_uid, name: a.display_name,
        phone: a.phone, state: a.state, district: a.district, place: a.place,
        approved: a.approval_status === "approved", photo: a.photo_path || "",
        upiId: a.upi_id || "", upiQr: a.upi_qr_path || ""
      };
      localStorage.setItem("myamin_demo_logged_in_amin_v1", JSON.stringify(local));
      if (typeof window.refreshAminMenuProfile === "function") window.refreshAminMenuProfile();
    }
  }
  if (p?.account_type === "customer") {
    localStorage.setItem("myamin_demo_user_v1", JSON.stringify({
      id: session.user.id, name: p.full_name || session.user.email,
      phone: session.user.phone || "", email: session.user.email || ""
    }));
  }
  if (typeof window.updateBookingUser === "function") window.updateBookingUser();
};
const ensureCustomerFields = () => {
  const form = $("loginForm");
  if (!form || $("customerPassword")) return;
  const grid = form.querySelector(".form-grid");
  const email = $("customerEmail");
  email.required = true;
  email.autocomplete = "email";
  email.placeholder = "name@example.com";
  const pass = document.createElement("div");
  pass.className = "field";
  pass.innerHTML = '<label for="customerPassword">Password / पासवर्ड *</label><input id="customerPassword" type="password" minlength="8" maxlength="72" autocomplete="current-password" required><small>कम-से-कम 8 characters.</small>';
  grid.appendChild(pass);
  const create = document.createElement("button");
  create.type = "button";
  create.id = "createCustomerAccount";
  create.className = "btn btn-outline";
  create.textContent = "Create Customer Account / नया अकाउंट";
  form.querySelector(".form-actions").prepend(create);
  create.addEventListener("click", async () => {
    const name = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const emailValue = email.value.trim();
    const password = $("customerPassword").value;
    if (!name || !phone || !emailValue || password.length < 8) {
      say("loginMessage", "नाम, मोबाइल, ईमेल और कम-से-कम 8 अक्षर का पासवर्ड भरें।", true);
      return;
    }
    create.disabled = true;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailValue, password,
        options: { data: { full_name: name, phone, account_type: "customer" } }
      });
      if (error) throw error;
      if (data.session) await showAuthState(data.session);
      say("loginMessage", data.session
        ? "Customer अकाउंट बन गया और सुरक्षित रूप से लॉगिन हो गया।"
        : "अकाउंट बन गया। अपना ईमेल खोलकर verification पूरा करें, फिर लॉगिन करें।");
    } catch (e) { say("loginMessage", e.message || "Signup असफल हुआ।", true); }
    finally { create.disabled = false; }
  });
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
const handleCustomerLogin = async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const email = $("customerEmail").value.trim();
  const password = $("customerPassword").value;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await showAuthState(data.session);
    say("loginMessage", "सुरक्षित Customer Login सफल।");
  } catch (e) { say("loginMessage", e.message || "Login असफल हुआ।", true); }
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
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, phone, account_type: "amin" } }
    });
    if (error) throw error;
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
const handleBooking = async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const user = await currentUser();
    const selected = $("bookingAmin").value.trim();
    let aminId = null;
    if (selected) {
      const { data } = await supabase.from("amin_profiles")
        .select("user_id").eq("profile_uid", selected).maybeSingle();
      aminId = data?.user_id || null;
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
    say("bookingMessage", "आपकी Booking सुरक्षित रूप से Database में जमा हो गई है।");
    $("bookingForm").reset();
    if (typeof window.refreshBookings === "function") await window.refreshBookings();
  } catch (e) { say("bookingMessage", e.message || "Booking जमा नहीं हुई। कृपया पहले Login करें।", true); }
};
window.logout = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem("myamin_demo_user_v1");
  localStorage.removeItem("myamin_demo_logged_in_amin_v1");
  if (typeof window.updateBookingUser === "function") window.updateBookingUser();
  say("loginMessage", "आप सुरक्षित रूप से Logout हो गए।");
};
document.addEventListener("DOMContentLoaded", () => {
  ensureCustomerFields();
  ensureAminFields();
  $("loginForm")?.addEventListener("submit", handleCustomerLogin, true);
  $("aminForm")?.addEventListener("submit", handleAminSignup, true);
  $("bookingForm")?.addEventListener("submit", handleBooking, true);
  $("loginForm")?.querySelector('button[onclick="logout()"]')?.addEventListener("click", window.logout);
});
const { data: initial } = await supabase.auth.getSession();
await showAuthState(initial.session);
supabase.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(() => showAuthState(session));
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
