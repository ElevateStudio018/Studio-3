// Demo-shim för den statiska versionen (t.ex. via raw.githack.com).
// Ersätter serverns API med låtsassvar och mappar sajtens adresser till de
// statiska filerna. Laddas före allt annat på demo-sidorna.
(function () {
  var isAdmin = /admin\.html$/.test(location.pathname);
  var params = new URLSearchParams(location.search);

  function mapPath(href) {
    var m = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    var p = m[1] || '/';
    var search = m[2] || '';
    var hash = m[3] || '';
    var stil = params.get('stil');
    if (stil && search.indexOf('stil=') < 0 && !/^\/admin/.test(p)) search += (search ? '&' : '?') + 'stil=' + stil;
    var out;
    if (p === '/' || p === '') out = 'index.html';
    else if (p === '/sok') out = 'sok.html';
    else if (/^\/sok\/[^/]+$/.test(p)) out = 'sok-' + p.slice(5) + '.html';
    else if (p === '/stilpaket') out = 'stilpaket.html';
    else if (p === '/integritet') out = 'integritet.html';
    else if (p === '/admin' || p === '/admin/') return 'admin.html' + hash;
    else if (/\.[a-z0-9]+$/i.test(p)) return '../public' + p;
    else out = 'index.html';
    return out + search + hash;
  }

  // Länkar som byggs i JavaScript pekar på serverns adresser – skriv om dem vid klick.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a || a.getAttribute('href').indexOf('//') === 0) return;
    var href = a.getAttribute('href');
    if (href.indexOf('/api/') === 0) {
      e.preventDefault();
      alert('Export kräver servern. Kör "npm start" för att ladda ner CSV-filer.');
      return;
    }
    a.setAttribute('href', mapPath(href));
  }, true);

  // ?stil= förhandsvisning: i serverversionen sköts det på servern.
  var stil = params.get('stil');
  if (stil && !isAdmin) {
    import('./themes.js').then(function (m) {
      var t = m.THEMES.find(function (x) { return x.id === stil; });
      if (t && document.documentElement.dataset.theme !== t.id) {
        m.applyTheme(t);
        var tv = document.getElementById('theme-vars');
        if (tv) tv.remove();
      }
    });
  }

  var json = function (data, status) {
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  };
  var realFetch = window.fetch.bind(window);
  navigator.sendBeacon = function () { return true; };

  // ---------- publika formulär ----------
  function publicApi(path, method) {
    if (path === '/api/public/applications' && method === 'POST') return json({ ok: true, ref: 'S3-DEMO' + Math.floor(1000 + Math.random() * 9000) }, 201);
    if (path === '/api/public/subscribe') return json({ ok: true, status: 'pending' });
    if (path === '/api/public/leads') return json({ ok: true }, 201);
    if (path === '/api/public/track') return json(null, 204);
    return json({ error: 'Inte tillgängligt i demoversionen.' }, 404);
  }

  // ---------- admin med fiktiv demodata ----------
  var db = null;
  var loggedIn = true;
  function load() {
    if (db) return Promise.resolve(db);
    return realFetch('data/admin-demo.json').then(function (r) { return r.json(); }).then(function (d) {
      db = d;
      db.appsById = {};
      d.applications.forEach(function (a) { db.appsById[a.id] = a; });
      return db;
    });
  }
  var LIST_KEYS = ['id', 'ref', 'debate_id', 'kind', 'status', 'rating', 'score', 'name', 'email', 'phone', 'age', 'birth_year', 'gender', 'municipality', 'county', 'occupation', 'party', 'party_member', 'office', 'econ', 'social', 'stance', 'need_label', 'tags', 'has_photo', 'created_at', 'duplicates', 'debate_title'];
  function listApps(q) {
    var items = Object.values(db.appsById);
    var f = function (k) { return q.get(k); };
    if (f('debate')) items = items.filter(function (a) { return f('debate') === 'talangbank' ? a.debate_id == null : a.debate_id === Number(f('debate')); });
    ['status', 'party', 'county', 'kind'].forEach(function (k) { if (f(k)) items = items.filter(function (a) { return a[k] === f(k); }); });
    if (f('tag')) items = items.filter(function (a) { return a.tags.indexOf(f('tag')) >= 0; });
    if (f('minAge')) items = items.filter(function (a) { return a.age >= Number(f('minAge')); });
    if (f('maxAge')) items = items.filter(function (a) { return a.age <= Number(f('maxAge')); });
    if (f('q')) {
      var s = f('q').toLowerCase();
      items = items.filter(function (a) { return [a.name, a.email, a.municipality, a.ref, a.occupation, a.motivation].join(' ').toLowerCase().indexOf(s) >= 0; });
    }
    var by = { score: function (a, b) { return b.score - a.score; }, rating: function (a, b) { return b.rating - a.rating || b.score - a.score; }, name: function (a, b) { return a.name.localeCompare(b.name, 'sv'); }, old: function (a, b) { return a.created_at < b.created_at ? -1 : 1; } }[f('sort')] || function (a, b) { return a.created_at < b.created_at ? 1 : -1; };
    items.sort(by);
    var counts = {};
    items.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });
    var limit = Number(f('limit')) || 200;
    return { total: items.length, counts: counts, items: items.slice(0, limit).map(function (a) { var o = {}; LIST_KEYS.forEach(function (k) { o[k] = a[k]; }); return o; }) };
  }
  function event(a, msg) { a.events.unshift({ type: 'demo', message: msg, user_email: 'demo@studio3.se', created_at: new Date().toISOString() }); }
  function patchApp(a, b) {
    if (b.status && b.status !== a.status) { event(a, a.status + ' → ' + b.status); a.status = b.status; }
    if (b.rating != null) a.rating = Number(b.rating);
    if (Array.isArray(b.tags)) a.tags = b.tags;
    if (typeof b.notes === 'string') a.notes = b.notes;
    if (b.debate_id !== undefined) {
      var d = db.debates.find(function (x) { return x.id === Number(b.debate_id); });
      a.debate_id = d ? d.id : null; a.debate_title = d ? d.title : null;
      event(a, 'Flyttad till ' + (d ? d.title : 'talangbanken'));
    }
    return a;
  }
  function slugify(s) { return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function saveDebate(id, b) {
    var existing = id && db.debateById[id];
    var d = Object.assign({}, existing || {}, b, {
      id: id || Math.max.apply(null, db.debates.map(function (x) { return x.id; }).concat(0)) + 1,
      slug: b.slug || (existing && existing.slug) || slugify(b.title || 'debatt'),
      formatName: db.formats[b.format] || b.format, applicants: existing ? existing.applicants : 0, open: b.status === 'open',
      needs: (b.needs || []).filter(function (n) { return n.label; }).map(function (n) { return Object.assign({}, n, { count: Number(n.count) || 0 }); }),
      questions: (b.questions || []).filter(function (q) { return q.label; }), compass: existing ? existing.compass : [],
    });
    d.needsStatus = d.needs.map(function (n) {
      var old = existing && existing.needsStatus.find(function (x) { return x.label === n.label; });
      return Object.assign({}, n, { applied: old ? old.applied : 0, shortlisted: old ? old.shortlisted : 0 });
    });
    db.debateById[d.id] = d;
    if (!existing) db.debates.unshift(d);
    else db.debates = db.debates.map(function (x) { return x.id === d.id ? d : x; });
    return d;
  }

  function adminApi(path, method, body, url) {
    return load().then(function () {
      var m;
      if (!db.debateById) { db.debateById = {}; db.debateDetails.forEach(function (d) { db.debateById[d.id] = d; }); }
      if (path === '/api/admin/login') { loggedIn = true; return json({ ok: true, user: db.me.user }); }
      if (path === '/api/admin/logout') { loggedIn = false; return json({ ok: true }); }
      if (!loggedIn) return json({ error: 'Logga in (valfritt lösenord i demon).' }, 401);
      if (path === '/api/admin/me') return json(db.me);
      if (path === '/api/admin/dashboard') return json(db.dashboard);
      if (path === '/api/admin/debates' && method === 'GET') return json(db.debates);
      if (path === '/api/admin/debates' && method === 'POST') return json(saveDebate(null, body), 201);
      if ((m = path.match(/^\/api\/admin\/debates\/(\d+)\/duplicate$/))) {
        var src = db.debateById[m[1]];
        return json({ id: saveDebate(null, Object.assign({}, src, { title: src.title + ' (kopia)', slug: src.slug + '-kopia', status: 'draft' })).id }, 201);
      }
      if ((m = path.match(/^\/api\/admin\/debates\/(\d+)$/))) {
        if (method === 'GET') return json(db.debateById[m[1]]);
        if (method === 'PUT') return json(saveDebate(Number(m[1]), body));
        if (method === 'DELETE') { db.debates = db.debates.filter(function (x) { return x.id !== Number(m[1]); }); return json({ ok: true }); }
      }
      if (path === '/api/admin/applications') return json(listApps(url.searchParams));
      if (path === '/api/admin/applications/bulk') {
        (body.ids || []).forEach(function (id) {
          var a = db.appsById[id];
          if (!a) return;
          if (body.action === 'status') patchApp(a, { status: body.status });
          if (body.action === 'tag' && a.tags.indexOf(body.tag) < 0) a.tags.push(body.tag);
          if (body.action === 'delete') delete db.appsById[id];
          if (body.action === 'email') event(a, body.template === 'invite' ? 'Inbjudan skickad (demo)' : 'Nej tack skickat (demo)');
        });
        return json({ ok: true, affected: (body.ids || []).length });
      }
      if ((m = path.match(/^\/api\/admin\/applications\/(\d+)\/email$/))) { event(db.appsById[m[1]], 'Mejl skickat (demo)'); return json({ ok: true, logged: true }); }
      if ((m = path.match(/^\/api\/admin\/applications\/(\d+)$/))) {
        var a = db.appsById[m[1]];
        if (!a) return json({ error: 'Hittades inte.' }, 404);
        if (method === 'PATCH') return json(patchApp(a, body));
        if (method === 'DELETE') { delete db.appsById[m[1]]; return json({ ok: true }); }
        return json(a);
      }
      if (path === '/api/admin/subscribers') {
        var q = url.searchParams, items = db.subscribers.items.filter(function (s) {
          return (!q.get('status') || s.status === q.get('status')) && (!q.get('q') || (s.email + ' ' + (s.name || '')).toLowerCase().indexOf(q.get('q').toLowerCase()) >= 0);
        });
        return json(Object.assign({}, db.subscribers, { total: items.length, items: items }));
      }
      if ((m = path.match(/^\/api\/admin\/subscribers\/(\d+)$/))) { db.subscribers.items = db.subscribers.items.filter(function (s) { return s.id !== Number(m[1]); }); return json({ ok: true }); }
      if (path === '/api/admin/campaigns/draft-videos') return json(db.draftVideos);
      if (path === '/api/admin/campaigns' && method === 'GET') return json(db.campaigns);
      if (path === '/api/admin/campaigns') {
        if (body.test) return json({ ok: true, test: true });
        var c = { id: db.campaigns.length + 1, subject: body.subject, segment: body.segment, recipients: db.subscribers.confirmed, auto: 0, sent_at: new Date().toISOString() };
        db.campaigns.unshift(c);
        return json(c, 201);
      }
      if (path === '/api/admin/videos') return json(db.videos);
      if (path === '/api/admin/videos/sync') return json({ ok: true, fresh: [] });
      if ((m = path.match(/^\/api\/admin\/videos\/([\w-]+)$/))) {
        var v = db.videos.items.find(function (x) { return x.id === m[1]; });
        if (v) Object.assign(v, body);
        return json({ ok: true });
      }
      if (path === '/api/admin/leads') return json(db.leads);
      if ((m = path.match(/^\/api\/admin\/leads\/(\d+)$/))) {
        var l = db.leads.find(function (x) { return x.id === Number(m[1]); });
        if (method === 'DELETE') { db.leads = db.leads.filter(function (x) { return x !== l; }); return json({ ok: true }); }
        Object.assign(l, body);
        return json(l);
      }
      if (path === '/api/admin/outbox') return json(db.outbox);
      if ((m = path.match(/^\/api\/admin\/outbox\/(\d+)$/))) return json(db.outboxById[m[1]]);
      if (path === '/api/admin/settings' && method === 'GET') return json(db.settings);
      if (path === '/api/admin/settings') {
        Object.assign(db.settings.site, body);
        return json({ ok: true, site: db.settings.site });
      }
      if (path === '/api/admin/password' || path === '/api/admin/users' || /^\/api\/admin\/users\//.test(path)) return json({ error: 'Användare hanteras bara i serverversionen.' }, 422);
      return json({ error: 'Inte tillgängligt i demoversionen.' }, 404);
    });
  }

  window.fetch = function (input, init) {
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    var path = typeof input === 'string' && input.charAt(0) === '/' ? input.split('?')[0] : url.pathname;
    if (path.indexOf('/api/') !== 0) return realFetch(input, init);
    var method = ((init && init.method) || 'GET').toUpperCase();
    var body = {};
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch (e) { /* tom */ }
    var full = new URL(typeof input === 'string' && input.charAt(0) === '/' ? location.origin + input : url.href);
    if (path.indexOf('/api/public/') === 0) return publicApi(path, method);
    if (path === '/api/admin/me' && !isAdmin) return json({ error: 'Inte inloggad' }, 401);
    return adminApi(path, method, body, full);
  };

  if (isAdmin) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.textContent = 'DEMO – fiktiva ansökningar, ändringar sparas inte';
      b.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:200;background:#F1944F;color:#1b0f05;font:700 12px/1 Inter,system-ui,sans-serif;padding:7px 12px;border-radius:999px;letter-spacing:.04em;pointer-events:none';
      document.body.appendChild(b);
    });
  }
})();
