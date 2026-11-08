import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "https://naitiksingh7512-csk.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "Sign in required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anon, { auth: { persistSession: false } });
  const root = createClient(url, service, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await callerClient.auth.getUser(jwt);
  if (authError || !auth.user) return reply({ error: "Valid sign-in required" }, 401);
  const caller = auth.user;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");

  if (action === "verify_card") {
    const token = String(body.card_token || "");
    if (token.length < 30 || token.length > 100) return reply({ error: "Invalid card link" }, 400);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
    const { data: member, error } = await root.from("admin_team_members")
      .select("full_name,email,role,status,permissions,must_change_password")
      .eq("user_id", caller.id).eq("card_token_hash", tokenHash).maybeSingle();
    if (error || !member || member.status !== "active" || !["team_member", "moderator", "admin"].includes(member.role)) {
      return reply({ error: "This card is invalid or the account is inactive." }, 403);
    }
    await root.from("admin_team_members").update({ last_login_at: new Date().toISOString() }).eq("user_id", caller.id);
    return reply({ success: true, member });
  }

  const { data: membership } = await root.from("admin_team_members").select("role,status").eq("user_id", caller.id).maybeSingle();
  if (action === "complete_password_change") {
    if (!membership || membership.status !== "active") return reply({ error: "Active team membership required" }, 403);
    const { error } = await root.from("admin_team_members")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("user_id", caller.id).eq("status", "active");
    if (error) return reply({ error: error.message }, 400);
    return reply({ success: true });
  }
  if (caller.app_metadata?.role !== "admin" || membership?.role !== "admin" || membership?.status !== "active") {
    return reply({ error: "Active admin membership required" }, 403);
  }
  if (action === "list_members") {
    const { data: members, error } = await root.from("admin_team_members")
      .select("user_id,role,status,permissions,full_name,email,phone,department,must_change_password,last_login_at,created_at")
      .order("created_at", { ascending: false });
    if (error) return reply({ error: error.message }, 400);
    const ids = (members || []).map(m => m.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await root.from("user_profiles").select("id,photo_url").in("id", ids)
      : { data: [], error: null };
    if (profileError) return reply({ error: profileError.message }, 400);
    const photos = new Map((profiles || []).map(p => [p.id, p.photo_url]));
    return reply({ success: true, members: (members || []).map(m => ({ ...m, photo_url: photos.get(m.user_id) || null })) });
  }

  if (action === "rotate_card") {
    const userId = String(body.user_id || "").trim();
    if (!userId || userId === caller.id) return reply({ error: "Choose a valid team member." }, 400);
    const { data: target, error: targetError } = await root.from("admin_team_members")
      .select("role,status").eq("user_id", userId).maybeSingle();
    if (targetError) return reply({ error: targetError.message }, 400);
    if (!target || target.role === "admin" || target.status !== "active") return reply({ error: "Only active non-admin team members can receive a card." }, 403);
    const token = randomToken();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
    const { error } = await root.from("admin_team_members")
      .update({ card_token_hash: tokenHash, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return reply({ error: error.message }, 400);
    await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: "team_member_card_rotated", target_type: "auth_user",
      target_id: userId, metadata: {}
    });
    return reply({ success: true, card_url: "https://naitiksingh7512-csk.github.io/MyAmin.com-/team-portal.html?card=" + encodeURIComponent(token) });
  }

  if (action === "create_member") {
    const name = String(body.full_name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim().slice(0, 30);
    const department = String(body.department || "").trim().slice(0, 80);
    const password = String(body.password || "");
    const role = String(body.role || "team_member");
    const permissions = body.permissions && typeof body.permissions === "object" ? body.permissions : {};
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 72) {
      return reply({ error: "Name, valid email and a 12–72 character password are required." }, 400);
    }
    if (!["team_member", "moderator"].includes(role)) return reply({ error: "Invalid role" }, 400);
    const { data: created, error: createError } = await root.auth.admin.createUser({
      email, password, email_confirm: true, app_metadata: { role },
      user_metadata: { full_name: name, account_type: "team_member", must_change_password: true }
    });
    if (createError || !created.user) return reply({ error: createError?.message || "Account creation failed" }, 400);

    const random = new Uint8Array(32); crypto.getRandomValues(random);
    const token = btoa(String.fromCharCode(...random)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
    const { error: insertError } = await root.from("admin_team_members").insert({
      user_id: created.user.id, role, status: "active", added_by: caller.id,
      full_name: name, email, phone: phone || null, department: department || null,
      permissions, card_token_hash: tokenHash, must_change_password: true
    });
    if (insertError) {
      await root.auth.admin.deleteUser(created.user.id);
      return reply({ error: "Member record failed: " + insertError.message }, 500);
    }
    const photoUrl = String(body.photo_url || "").trim().slice(0, 2000);
    const { error: profileError } = await root.from("user_profiles").upsert({
      id: created.user.id, full_name: name, photo_url: photoUrl || null
    }, { onConflict: "id" });
    if (profileError) {
      await root.from("admin_team_members").delete().eq("user_id", created.user.id);
      await root.auth.admin.deleteUser(created.user.id);
      return reply({ error: "Member profile failed: " + profileError.message }, 500);
    }
    await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: "team_member_created", target_type: "auth_user",
      target_id: created.user.id, metadata: { email, role, department, photo_added: !!photoUrl }
    });
    return reply({
      success: true, member: { id: created.user.id, name, email, role },
      card_url: "https://naitiksingh7512-csk.github.io/MyAmin.com-/team-portal.html?card=" + encodeURIComponent(token),
      card_token: token
    }, 201);
  }

  if (action === "set_member_status") {
    const userId = String(body.user_id || "");
    const status = String(body.status || "");
    if (!userId || !["active","blocked","removed"].includes(status)) return reply({ error: "Invalid member status" }, 400);
    if (userId === caller.id) return reply({ error: "You cannot block or remove your own admin account." }, 400);
    const { data: target, error: targetError } = await root.from("admin_team_members")
      .select("role,status").eq("user_id", userId).maybeSingle();
    if (targetError) return reply({ error: targetError.message }, 400);
    if (!target) return reply({ error: "Team member not found" }, 404);
    if (target.role === "admin") return reply({ error: "The main Admin account cannot be changed from Team Management." }, 403);
    if (target.status === "removed" && status !== "removed") return reply({ error: "A removed member cannot be reactivated. Create a new team account instead." }, 409);
    const { error } = await root.from("admin_team_members").update({ status, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return reply({ error: error.message }, 400);
    const { error: banError } = await root.auth.admin.updateUserById(userId, { ban_duration: status === "active" ? "none" : "876000h" });
    if (banError) return reply({ error: "Status saved but account ban update failed: " + banError.message }, 500);
    await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: "team_member_status_changed",
      target_type: "auth_user", target_id: userId, metadata: { status }
    });
    return reply({ success: true });
  }

  if (action === "delete_amin") {
    const profileUid = String(body.profile_uid || "").trim().slice(0, 120);
    if (!profileUid) return reply({ error: "Amin profile ID is required" }, 400);
    const { data: deleted, error } = await root.from("amin_profiles")
      .delete().eq("profile_uid", profileUid)
      .select("user_id,profile_uid,display_name,photo_path,upi_qr_path").maybeSingle();
    if (error) return reply({ error: error.message }, 400);
    if (!deleted) return reply({ error: "Amin profile not found" }, 404);
    const assetPaths = [deleted.photo_path, deleted.upi_qr_path].filter(p => typeof p === "string" && p && !p.startsWith("http"));
    if (assetPaths.length) {
      const { error: storageError } = await root.storage.from("amin-assets").remove(assetPaths);
      if (storageError) return reply({ error: "Profile deleted, but one or more stored images could not be removed: " + storageError.message }, 500);
    }
    await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: "amin_profile_deleted",
      target_type: "amin_profile", target_id: deleted.profile_uid,
      metadata: { user_id: deleted.user_id, display_name: deleted.display_name }
    });
    return reply({ success: true, deleted: { profile_uid: deleted.profile_uid, display_name: deleted.display_name } });
  }

  if (action === "create_task") {
    const assigned = String(body.assigned_to || "");
    const title = String(body.title || "").trim().slice(0,160);
    if (!assigned || !title) return reply({ error: "Assignee and task title are required" }, 400);
    const { data, error } = await root.from("team_member_tasks").insert({
      assigned_to: assigned, title, description: String(body.description || "").slice(0,3000),
      module: String(body.module || "general").slice(0,50), created_by: caller.id,
      due_at: body.due_at || null
    }).select().single();
    if (error) return reply({ error: error.message }, 400);
    await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: "team_task_created",
      target_type: "team_task", target_id: data.id, metadata: { assigned_to: assigned }
    });
    return reply({ success: true, task: data }, 201);
  }
  return reply({ error: "Unknown action" }, 400);
});