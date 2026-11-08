import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const allowedOrigin = "https://naitiksingh7512-csk.github.io";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== allowedOrigin) return reply({ error: "Origin not allowed" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request" }, 400); }
  const username = String(body.username ?? "").normalize("NFKC").trim();
  const password = String(body.password ?? "");
  const usernameKey = username.toLocaleLowerCase("en-US");
  if (!username || username.length > 160) return reply({ error: "Username 1 से 160 characters तक लिखें।" }, 400);
  if (password.length < 8 || password.length > 72) return reply({ error: "Password कम-से-कम 8 characters का होना चाहिए।" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ error: "Server configuration is incomplete." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forwarded));
  const ipHash = Array.from(new Uint8Array(ipDigest)).map(x => x.toString(16).padStart(2, "0")).join("");
  await admin.from("customer_signup_attempts").delete().lt("created_at", new Date(Date.now() - 86400000).toISOString());
  const { error: attemptError } = await admin.from("customer_signup_attempts").insert({ ip_hash: ipHash });
  if (attemptError) return reply({ error: "Signup temporarily unavailable. Please try again." }, 503);
  const { count, error: countError } = await admin.from("customer_signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  if (countError) return reply({ error: "Signup temporarily unavailable. Please try again." }, 503);
  if ((count ?? 0) > 5) return reply({ error: "बहुत अधिक प्रयास हुए। 10 मिनट बाद फिर कोशिश करें।" }, 429);

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(usernameKey));
  const tag = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
  const authEmail = tag + "@login.myamin.invalid";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: username, account_type: "customer" },
  });
  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message || "");
    return reply({ error: duplicate ? "यह Username पहले से मौजूद है। Login चुनें।" : (createError?.message || "Account नहीं बन पाया।") }, duplicate ? 409 : 400);
  }

  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: created.user.id, full_name: username, account_type: "customer",
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Profile save नहीं हो सकी; account creation रद्द कर दी गई।" }, 500);
  }
  return reply({ success: true });
});