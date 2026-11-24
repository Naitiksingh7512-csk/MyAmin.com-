/* MyAmin notifications + installable PWA helper.
   Uses the existing authenticated Supabase client and notifications RLS. */
(() => {
  "use strict";
  const start = () => {
    const supabase = window.myAminSupabase;
    const navActions = document.querySelector(".navactions");
    if (!navActions) return;

    const style = document.createElement("style");
    style.textContent = `
      #myaminNotifyButton{position:relative;width:42px;height:42px;border:1px solid #dce8df;border-radius:13px;background:#fff;color:#123b32;font-size:19px;display:grid;place-items:center}
      #myaminNotifyCount{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:20px;background:#d83b35;color:white;font:800 10px/18px system-ui;text-align:center}
      #myaminNotifyPanel{position:fixed;z-index:800;top:78px;right:14px;width:min(390px,calc(100vw - 20px));max-height:min(72vh,620px);overflow:auto;background:#fff;border:1px solid #dce8df;border-radius:18px;box-shadow:0 18px 50px #123b3226;padding:14px;display:none}
      #myaminNotifyPanel.open{display:block}
      .myamin-notify-row{padding:12px;border:1px solid #e3ece5;border-radius:13px;margin:9px 0;background:#fbfdfb}
      .myamin-notify-row.unread{border-left:4px solid #08785b;background:#f0f8f2}
      .myamin-notify-row strong{display:block;color:#123b32;font-size:13px}
      .myamin-notify-row p{margin:5px 0;color:#52675c;font-size:12px;line-height:1.5}
      .myamin-notify-row small{color:#839087;font-size:10px}
      #myaminNotifyPanel button{border:1px solid #dce8df;border-radius:10px;padding:8px 10px;background:#fff;color:#123b32;font-weight:700;font-size:11px}
      #myaminNotifyPanel .notify-actions{display:flex;gap:7px;flex-wrap:wrap}
      #myaminInstallButton{white-space:nowrap}
      @media(max-width:600px){#myaminNotifyButton{width:35px;height:35px}#myaminNotifyPanel{top:66px;right:8px}}
    `;
    document.head.appendChild(style);

    const bell = document.createElement("button");
    bell.type = "button";
    bell.id = "myaminNotifyButton";
    bell.setAttribute("aria-label", "Notifications");
    bell.title = "Notifications and recent activity";
    bell.innerHTML = '♢<span id="myaminNotifyCount" hidden>0</span>';
    navActions.prepend(bell);

    const install = document.createElement("button");
    install.type = "button";
    install.id = "myaminInstallButton";
    install.className = "btn btn-outline btn-small";
    install.textContent = "Install App";
    install.title = "Install MyAmin on this device";
    navActions.appendChild(install);

    const panel = document.createElement("section");
    panel.id = "myaminNotifyPanel";
    panel.setAttribute("aria-label", "Notifications and recent activity");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><strong style="color:#123b32">Notifications</strong><div style="font-size:11px;color:#718078">Recent booking and account activity</div></div>
        <button type="button" id="myaminNotifyClose" aria-label="Close">✕</button>
      </div>
      <div class="notify-actions" style="margin-top:12px">
        <button type="button" id="myaminNotifyPermission">Enable device alerts</button>
        <button type="button" id="myaminNotifyReadAll">Mark all as read</button>
      </div>
      <div id="myaminNotifyList" aria-live="polite"><p style="font-size:12px;color:#718078">Sign in to see your activity.</p></div>
    `;
    document.body.appendChild(panel);

    let rows = [];
    let channel = null;
    let installPrompt = null;
    const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const formatTime = value => {
      try { return new Date(value).toLocaleString(document.documentElement.lang === "hi" ? "hi-IN" : "en-IN"); }
      catch (_) { return ""; }
    };
    const setCount = () => {
      const count = rows.filter(n => !n.read_at).length;
      const badge = document.getElementById("myaminNotifyCount");
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = count === 0;
    };
    const render = () => {
      setCount();
      const list = document.getElementById("myaminNotifyList");
      if (!rows.length) {
        list.innerHTML = '<p style="font-size:12px;color:#718078;padding:12px 2px">No recent activity yet.</p>';
        return;
      }
      list.innerHTML = rows.map(n => `
        <article class="myamin-notify-row ${n.read_at ? "" : "unread"}">
          <strong>${safe(n.title)}</strong>
          <p>${safe(n.body)}</p>
          <small>${safe(formatTime(n.created_at))}</small>
          ${n.read_at ? "" : '<div style="margin-top:8px"><button type="button" data-notify-read="' + safe(n.id) + '">Mark as read</button></div>'}
        </article>`).join("");
      list.querySelectorAll("[data-notify-read]").forEach(button => button.addEventListener("click", () => markRead(button.dataset.notifyRead)));
    };
    const load = async user => {
      if (!supabase || !user) { rows = []; render(); return; }
      const { data, error } = await supabase.from("notifications")
        .select("id,title,body,notification_type,related_table,related_id,read_at,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      rows = data || [];
      render();
    };
    const markRead = async id => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
      if (error) { console.warn("MyAmin notification read update failed", error); return; }
      rows = rows.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n);
      render();
    };
    const notifyDevice = async n => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration?.showNotification) {
          await registration.showNotification(n.title || "MyAmin update", {
            body: n.body || "You have a new update.",
            icon: "./assets/myamin-home-icon.svg",
            badge: "./assets/myamin-home-icon.svg",
            tag: n.id,
            data: { url: "./" }
          });
        } else {
          new Notification(n.title || "MyAmin update", { body: n.body || "You have a new update." });
        }
      } catch (error) { console.warn("Device notification could not be shown", error); }
    };
    const subscribe = user => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!supabase || !user) return;
      channel = supabase.channel("myamin-notifications-" + user.id)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "notifications",
          filter: "user_id=eq." + user.id
        }, payload => {
          const n = payload.new;
          rows = [n, ...rows.filter(x => x.id !== n.id)].slice(0, 40);
          render();
          if (panel.classList.contains("open")) render();
          notifyDevice(n);
        })
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("MyAmin notification realtime status:", status);
        });
    };
    bell.addEventListener("click", async () => {
      panel.classList.toggle("open");
      if (!panel.classList.contains("open")) return;
      if (!supabase) return;
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) { document.getElementById("myaminNotifyList").textContent = "Please sign in to view notifications."; return; }
        await load(user);
      } catch (error) {
        document.getElementById("myaminNotifyList").textContent = error.message || "Notifications could not be loaded.";
      }
    });
    document.getElementById("myaminNotifyClose").addEventListener("click", () => panel.classList.remove("open"));
    document.getElementById("myaminNotifyReadAll").addEventListener("click", async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ids = rows.filter(n => !n.read_at).map(n => n.id);
      if (!ids.length) return;
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id).in("id", ids);
      if (error) { console.warn(error); return; }
      const now = new Date().toISOString();
      rows = rows.map(n => ({ ...n, read_at: n.read_at || now }));
      render();
    });
    document.getElementById("myaminNotifyPermission").addEventListener("click", async () => {
      if (!("Notification" in window)) { alert("This browser does not support device notifications."); return; }
      const result = await Notification.requestPermission();
      alert(result === "granted" ? "Device alerts enabled while MyAmin is active." : "Notification permission was not granted.");
    });

    install.addEventListener("click", async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        install.textContent = "Install App";
        return;
      }
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(isIOS
        ? "To install MyAmin: tap Share in Safari, then choose Add to Home Screen."
        : "If your browser supports installation, use its menu and choose Install app or Add to Home screen.");
    });
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      installPrompt = event;
      install.textContent = "Install App";
    });
    window.addEventListener("appinstalled", () => { install.textContent = "App Installed"; });

    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
        .catch(error => console.warn("MyAmin service worker registration failed", error));
    }

    if (supabase?.auth) {
      supabase.auth.getSession().then(({ data }) => {
        const user = data?.session?.user;
        if (user) { load(user).catch(error => console.warn(error)); subscribe(user); }
      });
      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        if (user) { load(user).catch(error => console.warn(error)); subscribe(user); }
        else { rows = []; render(); if (channel) supabase.removeChannel(channel); channel = null; }
      });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
