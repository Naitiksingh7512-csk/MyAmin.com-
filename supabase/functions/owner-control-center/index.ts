import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const OWNER_ID = "24dd2630-4624-46ee-8c54-37b9dc8fcd64";
const cors = {
  "Access-Control-Allow-Origin": "https://naitiksingh7512-csk.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TABLES = [
  "admin_announcements","admin_audit_logs","admin_settings","admin_team_members",
  "ai_conversations","ai_messages","ai_usage_daily","amin_favorites","amin_payment_requests",
  "amin_profiles","amin_reviews","booking_call_signals","booking_calls","booking_messages",
  "bookings","customer_signup_attempts","notifications","payment_records","service_categories",
  "support_ticket_messages","support_tickets","team_attendance","team_member_tasks","user_addresses","user_profiles"
];
const BOOKING_STATES = new Set(["pending","confirmed","in_progress","completed","cancelled"]);
const PAYMENT_REQUEST_STATES = new Set(["requested","submitted","verified","rejected"]);
const AMIN_APPROVAL_STATES = new Set(["pending","approved","rejected","blocked"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "Owner sign-in required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply({ error: "Server configuration is incomplete" }, 500);

  const callerClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await callerClient.auth.getUser(jwt);
  if (authError || !auth.user) return reply({ error: "Valid sign-in required" }, 401);
  const caller = auth.user;
  if (caller.id !== OWNER_ID || caller.app_metadata?.role !== "admin") return reply({ error: "Owner-only operation" }, 403);

  const { data: membership, error: membershipError } = await root.from("admin_team_members")
    .select("role,status").eq("user_id", caller.id).maybeSingle();
  if (membershipError || membership?.role !== "admin" || membership?.status !== "active") {
    return reply({ error: "Active Owner membership required" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");
  const audit = async (name: string, targetType: string | null, targetId: string | null, metadata: Record<string, unknown> = {}) => {
    const { error } = await root.from("admin_audit_logs").insert({
      actor_user_id: caller.id, action: name, target_type: targetType, target_id: targetId, metadata
    });
    if (error) throw error;
  };
  const notify = async (userId: string, title: string, message: string, type = "admin_notice", relatedTable: string | null = null, relatedId: string | null = null) => {
    const { error } = await root.from("notifications").insert({
      user_id: userId, title: title.slice(0, 100), body: message.slice(0, 1200),
      notification_type: type, related_table: relatedTable, related_id: relatedId
    });
    if (error) throw error;
  };

  try {
    if (action === "overview") {
      const counts: Record<string, number | null | string> = {};
      await Promise.all(TABLES.map(async table => {
        const { count, error } = await root.from(table).select("*", { count: "exact", head: true });
        counts[table] = error ? null : (count || 0);
      }));
      return reply({ success: true, counts, total_tables: TABLES.length });
    }

    if (action === "list_accounts") {
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
      const offset = Math.max(0, Number(body.offset) || 0);
      const query = String(body.query || "").trim().slice(0, 80);
      let q = root.from("user_profiles")
        .select("id,full_name,phone,district,account_type,account_status,created_at,photo_url")
        .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (query) q = q.or("full_name.ilike.%"+query+"%,phone.ilike.%"+query+"%,district.ilike.%"+query+"%");
      const { data, error, count } = await q;
      if (error) return reply({ error: error.message }, 400);
      const ids = (data || []).map(x => x.id);
      const { data: amins, error: aminError } = ids.length
        ? await root.from("amin_profiles").select("user_id,profile_uid,display_name,approval_status,account_status").in("user_id", ids)
        : { data: [], error: null };
      if (aminError) return reply({ error: aminError.message }, 400);
      const aminMap = new Map((amins || []).map(a => [a.user_id, a]));
      return reply({ success: true, total: count || 0, offset, limit, accounts: (data || []).map(x => ({ ...x, amin: aminMap.get(x.id) || null })) });
    }

    if (action === "account_detail") {
      const userId = String(body.user_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return reply({ error: "Invalid account ID" }, 400);
      const [{ data: profile, error: profileError }, { data: amin, error: aminError }, { data: addresses, error: addressError }, { data: bookings, error: bookingError }, { data: payments, error: paymentError }, { data: requests, error: requestError }, { data: reviews, error: reviewError }, { data: authResult, error: authError }] = await Promise.all([
        root.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
        root.from("amin_profiles").select("id,user_id,profile_uid,display_name,phone,whatsapp,state,district,place,business_reference,experience,services,photo_path,upi_id,upi_qr_path,approval_status,created_at,updated_at,location_lat,location_lng,location_shared_at,account_status,video_call_enabled,instagram_url,facebook_url,youtube_url").eq("user_id", userId).maybeSingle(),
        root.from("user_addresses").select("id,label,address_line,state,district,pincode,latitude,longitude,is_default,created_at,updated_at").eq("user_id", userId).order("created_at",{ascending:false}).limit(20),
        root.from("bookings").select("id,service,state,district,place,preferred_date,preferred_time,status,service_amount,commission_paid,created_at,completed_at,amin_user_id").or("customer_user_id.eq."+userId+",amin_user_id.eq."+userId).order("created_at",{ascending:false}).limit(20),
        root.from("payment_records").select("id,booking_id,payer_user_id,payee_user_id,amount,currency,payment_method,transaction_reference,status,proof_path,verified_by,verified_at,created_at,updated_at").or("payer_user_id.eq."+userId+",payee_user_id.eq."+userId).order("created_at",{ascending:false}).limit(20),
        root.from("amin_payment_requests").select("id,amount,note,payment_link,status,transaction_reference,proof_path,verified_by,verified_at,created_at,updated_at").eq("amin_user_id",userId).order("created_at",{ascending:false}).limit(20),
        root.from("amin_reviews").select("id,booking_id,rating,review,is_visible,created_at,customer_user_id").eq("amin_user_id",userId).order("created_at",{ascending:false}).limit(20),
        root.auth.admin.getUserById(userId)
      ]);
      const err = profileError || aminError || addressError || bookingError || paymentError || requestError || reviewError || authError;
      if (err) return reply({ error: "Account detail lookup failed: " + err.message }, 400);
      if (!profile && !amin) return reply({ error: "Account not found" }, 404);
      await audit("owner_account_detail_viewed","auth_user",userId,{has_amin_profile:!!amin});
      return reply({ success:true, account:{
        auth:{email:authResult?.user?.email||null,phone:authResult?.user?.phone||null,created_at:authResult?.user?.created_at||null,last_sign_in_at:authResult?.user?.last_sign_in_at||null,email_confirmed_at:authResult?.user?.email_confirmed_at||null},
        profile,amin_profile:amin,addresses:addresses||[],bookings:bookings||[],payment_records:payments||[],amin_payment_requests:requests||[],amin_reviews:reviews||[]
      }});
    }

    if (action === "set_account_status") {
      const userId = String(body.user_id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId) || !["active","blocked"].includes(status)) return reply({ error: "Invalid account or status" }, 400);
      if (userId === OWNER_ID) return reply({ error: "Owner account cannot be blocked here" }, 403);
      const { data: profile, error: profileError } = await root.from("user_profiles").select("id,full_name").eq("id", userId).maybeSingle();
      if (profileError) return reply({ error: profileError.message }, 400);
      if (!profile) return reply({ error: "Account profile not found" }, 404);
      const { error: authBanError } = await root.auth.admin.updateUserById(userId, {
        ban_duration: status === "blocked" ? "876000h" : "none"
      });
      if (authBanError) return reply({ error: "Auth status update failed: " + authBanError.message }, 400);
      const { error } = await root.from("user_profiles").update({ account_status: status, updated_at: new Date().toISOString() }).eq("id", userId);
      if (error) {
        await root.auth.admin.updateUserById(userId, { ban_duration: status === "blocked" ? "none" : "876000h" });
        return reply({ error: error.message }, 400);
      }
      await root.from("amin_profiles").update({ account_status: status, updated_at: new Date().toISOString() }).eq("user_id", userId);
      await audit("account_status_changed","auth_user",userId,{status});
      await notify(userId, status === "blocked" ? "My Amin account blocked" : "My Amin account reactivated",
        status === "blocked" ? "Your account access has been temporarily blocked. Contact support if you believe this is an error." : "Your account access has been restored.");
      return reply({ success: true, user_id: userId, status });
    }

    if (action === "set_amin_approval") {
      const profileUid = String(body.profile_uid || "");
      const status = String(body.status || "");
      if (!profileUid || profileUid.length > 80 || !AMIN_APPROVAL_STATES.has(status)) return reply({ error: "Invalid Amin profile or approval status" }, 400);
      const { data: amin, error } = await root.from("amin_profiles").update({
        approval_status: status, updated_at: new Date().toISOString()
      }).eq("profile_uid", profileUid).select("user_id,profile_uid,display_name").maybeSingle();
      if (error) return reply({ error: error.message }, 400);
      if (!amin) return reply({ error: "Amin profile not found" }, 404);
      await audit("amin_approval_status_changed","amin_profile",profileUid,{status});
      await notify(amin.user_id,"Amin profile status updated","Your Amin profile status is now: "+status,"amin_status","amin_profiles",null);
      return reply({ success: true, profile_uid: profileUid, status });
    }

    if (action === "set_booking_status") {
      const bookingId = String(body.booking_id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !BOOKING_STATES.has(status)) return reply({ error: "Invalid booking or status" }, 400);
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "completed") patch.completed_at = new Date().toISOString();
      const { data: booking, error } = await root.from("bookings").update(patch)
        .eq("id", bookingId).select("id,customer_user_id,amin_user_id,status").maybeSingle();
      if (error) return reply({ error: error.message }, 400);
      if (!booking) return reply({ error: "Booking not found" }, 404);
      await audit("booking_status_changed","booking",bookingId,{status});
      const recipients = [...new Set([booking.customer_user_id,booking.amin_user_id].filter(Boolean))] as string[];
      for (const userId of recipients) await notify(userId,"Booking status updated","Your booking status is now: "+status,"booking_status","bookings",bookingId);
      return reply({ success: true, booking_id: bookingId, status });
    }

    if (action === "set_payment_request_status") {
      const requestId = String(body.request_id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(requestId) || !PAYMENT_REQUEST_STATES.has(status)) return reply({ error: "Invalid request or status" }, 400);
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "verified") { patch.verified_by = caller.id; patch.verified_at = new Date().toISOString(); }
      const { data: request, error } = await root.from("amin_payment_requests").update(patch)
        .eq("id", requestId).select("id,amin_user_id,status").maybeSingle();
      if (error) return reply({ error: error.message }, 400);
      if (!request) return reply({ error: "Payment request not found" }, 404);
      await audit("amin_payment_request_status_changed","amin_payment_request",requestId,{status});
      await notify(request.amin_user_id,"Payment request updated","Your payment request status is now: "+status,"payment_request","amin_payment_requests",requestId);
      return reply({ success: true, request_id: requestId, status });
    }

    if (action === "set_payment_record_status") {
      const paymentId = String(body.payment_id || "");
      const status = String(body.status || "");
      const allowed = new Set(["pending","submitted","verified","failed","refunded"]);
      if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !allowed.has(status)) return reply({ error: "Invalid payment record or status" }, 400);
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "verified") { patch.verified_by = caller.id; patch.verified_at = new Date().toISOString(); }
      const { data: payment, error } = await root.from("payment_records").update(patch)
        .eq("id", paymentId).select("id,payer_user_id,payee_user_id,status,amount,currency").maybeSingle();
      if (error) return reply({ error: error.message }, 400);
      if (!payment) return reply({ error: "Payment record not found" }, 404);
      await audit("payment_record_status_changed","payment_record",paymentId,{status,administrative_only:true});
      const recipients = [...new Set([payment.payer_user_id,payment.payee_user_id].filter(Boolean))] as string[];
      for (const userId of recipients) await notify(userId,"Payment record updated","Your payment record status is now: "+status,"payment_status","payment_records",paymentId);
      return reply({ success: true, payment_id: paymentId, status, administrative_only: true });
    }

    if (action === "set_support_ticket_status") {
      const ticketId = String(body.ticket_id || "");
      const status = String(body.status || "");
      const allowed = new Set(["open","in_progress","resolved","closed"]);
      if (!/^[0-9a-f-]{36}$/i.test(ticketId) || !allowed.has(status)) return reply({ error: "Invalid support ticket or status" }, 400);
      const { data: ticket, error } = await root.from("support_tickets").update({ status, updated_at: new Date().toISOString() })
        .eq("id",ticketId).select("id,user_id,subject,status").maybeSingle();
      if (error) return reply({ error: error.message }, 400);
      if (!ticket) return reply({ error: "Support ticket not found" }, 404);
      await audit("support_ticket_status_changed","support_ticket",ticketId,{status});
      await notify(ticket.user_id,"Support ticket updated","Your support ticket '"+String(ticket.subject||"").slice(0,100)+"' is now "+status+".","support_status","support_tickets",ticketId);
      return reply({ success: true, ticket_id: ticketId, status });
    }

    if (action === "send_notification") {
      const userId = String(body.user_id || "");
      const title = String(body.title || "").trim();
      const message = String(body.message || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(userId) || !title || !message || title.length > 100 || message.length > 1200) {
        return reply({ error: "A valid recipient, title and message are required" }, 400);
      }
      await notify(userId,title,message);
      await audit("owner_notification_sent","user",userId,{title});
      return reply({ success: true });
    }

    if (action === "set_website_setting") {
      const key = String(body.setting_key || "");
      const value = body.setting_value;
      if (!/^[a-z][a-z0-9_]{1,59}$/.test(key) || value === undefined) return reply({ error: "Invalid website setting" }, 400);
      const { error } = await root.from("admin_settings").upsert({
        setting_key: key, setting_value: value, updated_by: caller.id, updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" });
      if (error) return reply({ error: error.message }, 400);
      await audit("website_setting_updated","setting",key,{});
      return reply({ success: true, setting_key: key });
    }


    if (action === "list_table") {
      const TABLE_COLUMNS: Record<string, string[]> = {
        admin_announcements: ["id","title","body","link_url","is_active","created_by","created_at","updated_at","content_type","image_url","starts_at","ends_at"],
        admin_audit_logs: ["id","actor_user_id","action","target_type","target_id","metadata","created_at"],
        admin_settings: ["setting_key","setting_value","updated_by","updated_at"],
        admin_team_members: ["id","user_id","role","status","added_by","created_at","updated_at","full_name","email","phone","department","permissions","must_change_password","last_login_at"],
        ai_conversations: ["id","user_id","title","created_at","updated_at"],
        ai_messages: ["id","conversation_id","user_id","role","content","created_at"],
        ai_usage_daily: ["user_id","usage_date","request_count"],
        amin_favorites: ["customer_user_id","amin_user_id","created_at"],
        amin_payment_requests: ["id","amin_user_id","created_by","amount","note","payment_link","status","transaction_reference","proof_path","verified_by","verified_at","created_at","updated_at"],
        amin_profiles: ["id","user_id","profile_uid","display_name","phone","whatsapp","state","district","place","business_reference","experience","services","photo_path","upi_id","upi_qr_path","approval_status","created_at","updated_at","location_lat","location_lng","location_shared_at","account_status","video_call_enabled","instagram_url","facebook_url","youtube_url"],
        amin_reviews: ["id","booking_id","customer_user_id","amin_user_id","rating","review","is_visible","created_at"],
        booking_call_signals: ["id","call_id","sender_user_id","signal_type","created_at"],
        booking_calls: ["id","booking_id","caller_user_id","callee_user_id","call_type","status","created_at","accepted_at","ended_at","updated_at"],
        booking_messages: ["id","booking_id","sender_user_id","message","attachment_path","read_at","created_at"],
        bookings: ["id","customer_user_id","amin_user_id","service","state","district","place","preferred_date","preferred_time","details","status","confirmed_date","confirmed_time","created_at","updated_at","service_amount","commission_paid","completed_at"],
        customer_signup_attempts: ["id","ip_hash","created_at"],
        notifications: ["id","user_id","title","body","notification_type","related_table","related_id","read_at","created_at","attachment_path"],
        payment_records: ["id","booking_id","payer_user_id","payee_user_id","amount","currency","payment_method","transaction_reference","status","proof_path","verified_by","verified_at","created_at","updated_at"],
        service_categories: ["id","slug","name_en","name_hi","description","icon","is_active","sort_order","created_at","updated_at"],
        support_ticket_messages: ["id","ticket_id","sender_user_id","message","created_at"],
        support_tickets: ["id","user_id","subject","description","status","priority","assigned_to","created_at","updated_at"],
        team_attendance: ["id","member_user_id","work_date","check_in_at","check_out_at","note","created_at","updated_at"],
        team_member_tasks: ["id","assigned_to","title","description","module","status","due_at","created_by","created_at","updated_at"],
        user_addresses: ["id","user_id","label","address_line","state","district","pincode","latitude","longitude","is_default","created_at","updated_at"],
        user_profiles: ["id","full_name","phone","district","created_at","updated_at","account_type","location_lat","location_lng","location_shared_at","photo_url","account_status"]
      };
      const table = String(body.table || "");
      const columns = TABLE_COLUMNS[table];
      if (!columns) return reply({ error: "Table is not available in the Owner data explorer" }, 400);
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
      const offset = Math.max(0, Number(body.offset) || 0);
      const orderColumn = table === "admin_settings" ? "updated_at" : table === "service_categories" ? "sort_order" : table === "ai_usage_daily" ? "usage_date" : "created_at";
      let query = root.from(table).select(columns.join(","), { count: "exact" });
      if (orderColumn === "sort_order") query = query.order(orderColumn, { ascending: true });
      else query = query.order(orderColumn, { ascending: false, nullsFirst: false });
      const { data, error, count } = await query.range(offset, offset + limit - 1);
      if (error) return reply({ error: error.message }, 400);
      await audit("owner_table_viewed", "table", table, { offset, limit, rows_returned: (data || []).length });
      return reply({ success: true, table, columns, total: count || 0, offset, limit, rows: data || [] });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});