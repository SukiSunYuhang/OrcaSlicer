(()=>{var P=()=>navigator.vendor==="Google Inc."||navigator.agent==="Edg/",L=()=>typeof ImageDecoder>"u"?!1:P(),U=()=>typeof Intl.v8BreakIterator<"u"&&typeof Intl.Segmenter<"u",W=()=>{let i=[0,97,115,109,1,0,0,0,1,5,1,95,1,120,0];return WebAssembly.validate(new Uint8Array(i))},f={hasImageCodecs:L(),hasChromiumBreakIterators:U(),supportsWasmGC:W(),crossOriginIsolated:window.crossOriginIsolated};var h=j();function j(){let i=document.querySelector("base");return i&&i.getAttribute("href")||""}function m(...i){return i.filter(t=>!!t).map((t,n)=>n===0?_(t):K(_(t))).filter(t=>t.length).join("/")}function K(i){let t=0;for(;t<i.length&&i.charAt(t)==="/";)t++;return i.substring(t)}function _(i){let t=i.length;for(;t>0&&i.charAt(t-1)==="/";)t--;return i.substring(0,t)}function I(i,t){return i.canvasKitBaseUrl?i.canvasKitBaseUrl:t.engineRevision&&!t.useLocalCanvasKit?m("https://www.gstatic.com/flutter-canvaskit",t.engineRevision):"/canvaskit"}var v=class{constructor(){this._scriptLoaded=!1}setTrustedTypesPolicy(t){this._ttPolicy=t}async loadEntrypoint(t){let{entrypointUrl:n=m(h,"main.dart.js"),onEntrypointLoaded:e,nonce:r}=t||{};return this._loadJSEntrypoint(n,e,r)}async load(t,n,e,r,s){s??=o=>{o.initializeEngine(e).then(c=>c.runApp())};let{entryPointBaseUrl:a}=e;if(t.compileTarget==="dart2wasm")return this._loadWasmEntrypoint(t,n,a,s);{let o=t.mainJsPath??"main.dart.js",c=m(h,a,o);return this._loadJSEntrypoint(c,s,r)}}didCreateEngineInitializer(t){typeof this._didCreateEngineInitializerResolve=="function"&&(this._didCreateEngineInitializerResolve(t),this._didCreateEngineInitializerResolve=null,delete _flutter.loader.didCreateEngineInitializer),typeof this._onEntrypointLoaded=="function"&&this._onEntrypointLoaded(t)}_loadJSEntrypoint(t,n,e){let r=typeof n=="function";if(!this._scriptLoaded){this._scriptLoaded=!0;let s=this._createScriptTag(t,e);if(r)console.debug("Injecting <script> tag. Using callback."),this._onEntrypointLoaded=n,document.head.append(s);else return new Promise((a,o)=>{console.debug("Injecting <script> tag. Using Promises. Use the callback approach instead!"),this._didCreateEngineInitializerResolve=a,s.addEventListener("error",o),document.head.append(s)})}}async _loadWasmEntrypoint(t,n,e,r){if(!this._scriptLoaded){this._scriptLoaded=!0,this._onEntrypointLoaded=r;let{mainWasmPath:s,jsSupportRuntimePath:a}=t,o=m(h,e,s),c=m(h,e,a);this._ttPolicy!=null&&(c=this._ttPolicy.createScriptURL(c));let p=WebAssembly.compileStreaming(fetch(o)),l=await import(c),w;t.renderer==="skwasm"?w=(async()=>{let u=await n.skwasm;return window._flutter_skwasmInstance=u,{skwasm:u.wasmExports,skwasmWrapper:u,ffi:{memory:u.wasmMemory}}})():w={};let d=await l.instantiate(p,w);await l.invoke(d)}}_createScriptTag(t,n){let e=document.createElement("script");e.type="application/javascript",n&&(e.nonce=n);let r=t;return this._ttPolicy!=null&&(r=this._ttPolicy.createScriptURL(t)),e.src=r,e}};async function S(i,t,n){if(t<0)return i;let e,r=new Promise((s,a)=>{e=setTimeout(()=>{a(new Error(`${n} took more than ${t}ms to resolve. Moving on.`,{cause:S}))},t)});return Promise.race([i,r]).finally(()=>{clearTimeout(e)})}var y=class{setTrustedTypesPolicy(t){this._ttPolicy=t}loadServiceWorker(t){if(!t)return console.debug("Null serviceWorker configuration. Skipping."),Promise.resolve();if(!("serviceWorker"in navigator)){let o="Service Worker API unavailable.";return window.isSecureContext||(o+=`
The current context is NOT secure.`,o+=`
Read more: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`),Promise.reject(new Error(o))}let{serviceWorkerVersion:n,serviceWorkerUrl:e=m(h,`flutter_service_worker.js?v=${n}`),timeoutMillis:r=4e3}=t,s=e;this._ttPolicy!=null&&(s=this._ttPolicy.createScriptURL(s));let a=navigator.serviceWorker.register(s).then(o=>this._getNewServiceWorker(o,n)).then(this._waitForServiceWorkerActivation);return S(a,r,"prepareServiceWorker")}async _getNewServiceWorker(t,n){if(!t.active&&(t.installing||t.waiting))return console.debug("Installing/Activating first service worker."),t.installing||t.waiting;if(t.active.scriptURL.endsWith(n))return console.debug("Loading from existing service worker."),t.active;{let e=await t.update();return console.debug("Updating service worker."),e.installing||e.waiting||e.active}}async _waitForServiceWorkerActivation(t){if(!t||t.state==="activated")if(t){console.debug("Service worker already active.");return}else throw new Error("Cannot activate a null service worker!");return new Promise((n,e)=>{t.addEventListener("statechange",()=>{t.state==="activated"&&(console.debug("Activated new service worker."),n())})})}};var g=class{constructor(t,n="flutter-js"){let e=t||[/\.js$/,/\.mjs$/];window.trustedTypes&&(this.policy=trustedTypes.createPolicy(n,{createScriptURL:function(r){if(r.startsWith("blob:"))return r;let s=new URL(r,window.location),a=s.pathname.split("/").pop();if(e.some(c=>c.test(a)))return s.toString();console.error("URL rejected by TrustedTypes policy",n,":",r,"(download prevented)")}}))}};var k=i=>{let t=WebAssembly.compileStreaming(fetch(i));return(n,e)=>((async()=>{let r=await t,s=await WebAssembly.instantiate(r,n);e(s,r)})(),{})};var T=(i,t,n,e)=>window.flutterCanvasKit?Promise.resolve(window.flutterCanvasKit):(window.flutterCanvasKitLoaded=new Promise((r,s)=>{let a=n.hasChromiumBreakIterators&&n.hasImageCodecs;if(!a&&t.canvasKitVariant=="chromium")throw"Chromium CanvasKit variant specifically requested, but unsupported in this browser";let o=a&&t.canvasKitVariant!=="full",c=e;o&&(c=m(c,"chromium"));let p=m(c,"canvaskit.js");i.flutterTT.policy&&(p=i.flutterTT.policy.createScriptURL(p));let l=k(m(c,"canvaskit.wasm")),w=document.createElement("script");w.src=p,t.nonce&&(w.nonce=t.nonce),w.addEventListener("load",async()=>{try{let d=await CanvasKitInit({instantiateWasm:l});window.flutterCanvasKit=d,r(d)}catch(d){s(d)}}),w.addEventListener("error",s),document.head.appendChild(w)}),window.flutterCanvasKitLoaded);var E=(i,t,n,e)=>new Promise((r,s)=>{let a=m(e,"skwasm.js");i.flutterTT.policy&&(a=i.flutterTT.policy.createScriptURL(a));let o=k(m(e,"skwasm.wasm")),c=document.createElement("script");c.src=a,t.nonce&&(c.nonce=t.nonce),c.addEventListener("load",async()=>{try{let p=await skwasm({instantiateWasm:o,locateFile:(l,w)=>{let d=w+l;return d.endsWith(".worker.js")?URL.createObjectURL(new Blob([`importScripts("${d}");`],{type:"application/javascript"})):d}});r(p)}catch(p){s(p)}}),c.addEventListener("error",s),document.head.appendChild(c)});var C=class{async loadEntrypoint(t){let{serviceWorker:n,...e}=t||{},r=new g,s=new y;s.setTrustedTypesPolicy(r.policy),await s.loadServiceWorker(n).catch(o=>{console.warn("Exception while loading service worker:",o)});let a=new v;return a.setTrustedTypesPolicy(r.policy),this.didCreateEngineInitializer=a.didCreateEngineInitializer.bind(a),a.loadEntrypoint(e)}async load({serviceWorkerSettings:t,onEntrypointLoaded:n,nonce:e,config:r}={}){r??={};let s=_flutter.buildConfig;if(!s)throw"FlutterLoader.load requires _flutter.buildConfig to be set";let a=u=>{switch(u){case"skwasm":return f.crossOriginIsolated&&f.hasChromiumBreakIterators&&f.hasImageCodecs&&f.supportsWasmGC;default:return!0}},o=(u,b)=>{switch(u.renderer){case"auto":return b=="canvaskit"||b=="html";default:return u.renderer==b}},c=u=>u.compileTarget==="dart2wasm"&&!f.supportsWasmGC||r.renderer&&!o(u,r.renderer)?!1:a(u.renderer),p=s.builds.find(c);if(!p)throw"FlutterLoader could not find a build compatible with configuration and environment.";let l={};l.flutterTT=new g,t&&(l.serviceWorkerLoader=new y,l.serviceWorkerLoader.setTrustedTypesPolicy(l.flutterTT.policy),await l.serviceWorkerLoader.loadServiceWorker(t).catch(u=>{console.warn("Exception while loading service worker:",u)}));let w=I(r,s);p.renderer==="canvaskit"?l.canvasKit=T(l,r,f,w):p.renderer==="skwasm"&&(l.skwasm=E(l,r,f,w));let d=new v;return d.setTrustedTypesPolicy(l.flutterTT.policy),this.didCreateEngineInitializer=d.didCreateEngineInitializer.bind(d),d.load(p,l,r,e,n)}};window._flutter||(window._flutter={});window._flutter.loader||(window._flutter.loader=new C);})();
//# sourceMappingURL=flutter.js.map

if (!window._flutter) {
  window._flutter = {};
}
_flutter.buildConfig = {"engineRevision":"b8800d88be4866db1b15f8b954ab2573bba9960f","builds":[{"compileTarget":"dart2js","renderer":"canvaskit","mainJsPath":"main.983d3eca8f92f614.js"}]};


// =============================================================================
// Orca web bootstrap.
//
// This file is the single source of truth for the Flutter web loading flow.
// `flutter build web` copies it to build/web/flutter_bootstrap.js, substituting
// the two build tokens at the very top of this file (flutter_js and
// flutter_build_config): the first makes `_flutter.loader` available, the second
// sets `_flutter.buildConfig` (which FlutterLoader.load requires — that is why
// .load() must live here, not in index.html with a bare flutter.js).
//
// IMPORTANT: never type the literal double-brace tokens inside a comment. The
// build substitutes them EVERYWHERE in the file, including comments — doing so
// injects the loader code mid-comment, and since the loader contains a
// multi-line template literal, the comment's `//` only covers the first line,
// turning the rest into live JS and breaking parsing.
//
// Edit THIS file, not the built output.
//
// index.html only need:
//   <script src="$FLUTTER_BOOTSTRAP_JS" async></script>
// (the $FLUTTER_BOOTSTRAP_JS placeholder is rewritten by build_web.sh to the
// content-hashed flutter_bootstrap.<hash>.js), plus the #flutter-loading /
// #flutter-error overlay markup + CSS.
// =============================================================================
(function () {
  var FLUTTER_LOAD_TIMEOUT_MS = 30000; // 30s — entrypoint download phase
  var FLUTTER_FIRST_FRAME_TIMEOUT_MS = 30000; // 30s — first-frame watchdog after entrypoint loaded
  var entrypointReady = false;
  var loadingEl = document.getElementById('flutter-loading');
  var errorEl = document.getElementById('flutter-error');
  var detailEl = document.getElementById('flutter-error__detail');
  var timeoutId = null;
  var startTime = performance.now();

  function logProgress(step) {
    console.log('[Orca Web] +' + Math.round(performance.now() - startTime) + 'ms ' + step);
  }

  // Forward a log line to the native container's file log via the WCP postMessage
  // bridge (window.sendMessage -> window.wx.postMessage). The native side handles
  // the sw_FileLog cmd by appending {level, content} to its log file. Best-effort:
  // if the bridge is not yet available we only emit to the console. This lets us
  // persist resource-load / engine failures even when the Flutter UI never comes up.
  var _wcpLogSeq = 0;
  function writeWcpLog(level, message) {
    var content = '[' + new Date().toISOString() + '][' + level + '][OrcaWeb][' + message + ']';
    var packet = {
      header: { seqid: 'weblog-' + (++_wcpLogSeq) },
      payload: {
        cmd: 'sw_FileLog',
        event_id: null,
        params: { level: level, content: content },
        metadata: null
      }
    };
    try {
      var json = JSON.stringify(packet);
      if (typeof window.sendMessage === 'function') {
        window.sendMessage(json);
      } else if (window.wx && typeof window.wx.postMessage === 'function') {
        window.wx.postMessage(json);
      } else {
        console.error('[Orca Web] WCP log bridge unavailable; not sent: ' + message);
      }
    } catch (e) {
      console.error('[Orca Web] writeWcpLog failed: ' + e);
    }
  }

  logProgress('Start loading');

  // One-time migration: the previous package registered a service worker
  // (orca_service_worker.js) that is NOT shipped by this build, but a SW that was
  // registered earlier persists in the browser/WebView until it is explicitly
  // unregistered — and it keeps intercepting requests and serving its stale
  // cache. Unregister every SW and wipe every Cache Storage bucket so this build
  // is served fresh. Best-effort; can be removed once all clients have migrated.
  (function cleanupLegacyServiceWorker() {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (reg) { reg.unregister(); });
        }).catch(function () {});
      }
      if (window.caches && typeof caches.keys === 'function') {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k); });
        }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
  })();

  // WASM MIME guard: WebAssembly.compileStreaming rejects responses whose
  // Content-Type is not application/wasm ("Unexpected response MIME type").
  // The embedded local HTTP server serves canvaskit.wasm as octet-stream, so
  // the engine's streaming compile fails at startup. Wrap compileStreaming to
  // detect a wrong/missing MIME, fall back to buffered compile (which skips the
  // MIME check), and log once for diagnosis. Must be installed before
  // _flutter.loader.load() runs.
  (function patchWasmStreaming() {
    var orig = WebAssembly.compileStreaming;
    if (typeof orig !== 'function') { return; }
    var warned = false;
    WebAssembly.compileStreaming = function (source) {
      return Promise.resolve(source).then(function (resp) {
        var ct = '';
        try { ct = (resp && resp.headers && resp.headers.get('Content-Type')) || ''; } catch (e) {}
        if (ct.indexOf('application/wasm') !== -1) {
          return orig(resp);
        }
        if (!warned) {
          warned = true;
          console.warn('[Orca Web] wasm served with MIME "' + ct + '" (expected application/wasm); using buffered compile fallback');
          writeWcpLog('warn', 'wasm MIME "' + ct + '" != application/wasm; buffered compile fallback used');
        }
        return resp.arrayBuffer().then(function (buf) {
          return WebAssembly.compile(buf);
        });
      });
    };
  })();

  // User tapped the error page's Reload button: log it to the native file log
  // (best-effort) before window.location.reload() navigates away.
  window.__orcaLogReload = function () {
    console.log('[Orca Web] Reload button clicked, reloading');
    writeWcpLog('info', 'Reload button clicked, reloading');
  };

  function showFatalError(reason) {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (loadingEl) loadingEl.remove();
    if (errorEl) errorEl.style.display = 'flex';
    // Error detail is intentionally NOT shown in the UI (product decision); it is
    // reported to the console and the native file log via the WCP postMessage bridge.
    // if (detailEl) detailEl.textContent = reason;
    console.error('[Orca Web] Load failed: ' + reason);
    writeWcpLog('error', 'Load failed: ' + reason);
  }

  // Capture internal errors thrown by main.js (uncaught exceptions during
  // Dart static init / main(), or unhandled promise rejections inside the
  // engine) and surface them in the error overlay instead of letting the user
  // stare at a spinner until the first-frame timeout fires. Without this, the
  // real stack lives only in the console and the overlay shows a generic
  // "first frame did not render" message.
  // Gated on loadingEl: once the first frame has rendered and the overlay is
  // removed, runtime errors are left to Flutter's own handler — we never hijack
  // a live app.
  function describeError(kind, ev) {
    var msg = '', stack = '';
    if (kind === 'error') {
      msg = (ev && ev.message) || (ev && ev.error && ev.error.message) || String(ev);
      stack = (ev && ev.error && ev.error.stack) || '';
    } else { // unhandledrejection
      var reason = ev && ev.reason;
      if (reason && reason instanceof Error) {
        msg = reason.message || String(reason);
        stack = reason.stack || '';
      } else {
        msg = (reason !== undefined && reason !== null) ? String(reason) : '<no reason>';
      }
    }
    var detail = msg || '<no message>';
    if (stack) { detail += '\n' + stack; }
    if (detail.length > 2000) { detail = detail.slice(0, 2000) + '\n…(truncated)'; }
    return detail;
  }

  function captureFatal(kind, ev) {
    if (!loadingEl) { return; } // app already up — leave runtime errors to Flutter
    var prefix = 'main.js runtime error';
    if (kind === 'error' && ev && ev.filename) {
      prefix += ' (' + ev.filename + (ev.lineno ? (':' + ev.lineno) : '') + ')';
    }
    showFatalError(prefix + ':\n' + describeError(kind, ev));
  }

  // Diagnostic snapshot for timeout reports: which stage stalled. Helps tell apart
  // "main.js never downloaded" from "downloaded but engine never started" —
  // on Windows WebView the 7MB canvaskit.wasm compile is a common stall point.
  function _loadDiag() {
    var mainJs = null;
    for (var k in _resUrls) {
      if (_isMainJs(k)) { mainJs = _resUrls[k]; break; }
    }
    var ck = _resUrls['canvaskit.wasm'];
    // The 8.26MB HarmonyOS font is fetched by the engine during initialization; a
    // stalled font load is a known white-screen cause, so surface it explicitly in
    // the diagnostic instead of a generic "first frame did not render".
    var font = _resUrls['HarmonyOS_Sans_SC_Regular.ttf'];
    return 'Diag{resources=' + _resLoaded +
           ', main.js=' + (mainJs ? 'loaded(' + mainJs + 'ms)' : 'NOT loaded') +
           ', canvaskit.wasm=' + (ck ? 'loaded(' + ck + 'ms)' : 'not loaded') +
           ', font.ttf=' + (font ? 'loaded(' + font + 'ms)' : 'NOT loaded') + '}';
  }

  // Resource loading progress: log every fetched resource (script / font / asset /
  // manifest / icon) to the console as it completes, so the sequence and timing of
  // each load is visible during diagnosis. Covers main.js, AssetManifest,
  // canvaskit.wasm, fonts, icons, etc. — including resources the engine fetches
  // internally.
  var _resLoaded = 0;
  var _resUrls = {};
  function _shortUrl(url) {
    try {
      var name = url.split('?')[0].split('#')[0].split('/').pop();
      return name ? decodeURIComponent(name) : url;
    } catch (e) { return url; }
  }
  // The entrypoint is content-hashed at build time (main.<hash>.js), so match by
  // shape instead of the literal "main.js".
  function _isMainJs(url) {
    return /^main\..+\.js$/.test(_shortUrl(url));
  }
  if (window.PerformanceObserver) {
    try {
      var resObserver = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          _resLoaded++;
          _resUrls[_shortUrl(entry.name)] = Math.round(entry.duration);
          logProgress('Resource [' + _resLoaded + '] ' + _shortUrl(entry.name) +
                      ' (' + Math.round(entry.duration) + 'ms, ' +
                      Math.round(entry.transferSize || 0) + 'B)');
        });
      });
      // Prefer the modern (type + buffered) form; fall back to the legacy entryTypes
      // form for older WebViews. Both are best-effort — wrapped in try/catch.
      try {
        resObserver.observe({ type: 'resource', buffered: true });
      } catch (e1) {
        resObserver.observe({ entryTypes: ['resource'] });
      }
    } catch (e) {
      logProgress('PerformanceObserver(resource) unavailable: ' + e);
    }
  }

  // Resource-load failures (img / script / link) reach the window 'error' listener
  // in the CAPTURE phase with ev.target = the element and no ev.message / ev.error.
  // JS runtime errors reach it with ev.message / ev.error set. Route them apart:
  // resource failures are logged and forwarded to the WCP file log, but do not by
  // themselves trigger the fatal page — the timeout / first-frame guards below still
  // cover the critical "main.js never loaded" case. Gated on loadingEl so a
  // running app's lazy-load failures are left to Flutter, matching captureFatal.
  function onResourceFail(target) {
    if (!loadingEl) { return; }
    var url = '';
    if (target) {
      url = target.src || target.href ||
            (target.getAttribute && target.getAttribute('src')) || '';
    }
    var msg = 'Resource failed to load: ' + (url ? _shortUrl(url) : '<unknown>');
    logProgress(msg);
    console.error('[Orca Web] ' + msg);
    writeWcpLog('error', msg);
    // The entrypoint has no cache fallback: if it fails (404 / MIME / throttled),
    // the app cannot boot. Surface the error now instead of spinning until the
    // 30s watchdog — on a throttled loopback nothing more is coming.
    if (url && _isMainJs(url) && !entrypointReady) {
      showFatalError('Entrypoint failed to load (' + _shortUrl(url) +
                     '); no cache fallback. ' + _loadDiag());
    }
  }

  window.addEventListener('error', function (ev) {
    var target = ev && ev.target;
    var isResource = target && target !== window &&
      (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK') &&
      !ev.message && !ev.error;
    if (isResource) {
      onResourceFail(target);
    } else {
      captureFatal('error', ev);
    }
  }, true);
  window.addEventListener('unhandledrejection', function (ev) { captureFatal('rejection', ev); });

  // 30s timeout guard: if onEntrypointLoaded has not fired, treat loading as failed and show the static error page
  timeoutId = setTimeout(function () {
    if (!entrypointReady) {
      showFatalError('Resource load timed out (' + (FLUTTER_LOAD_TIMEOUT_MS / 1000) +
                     's); onEntrypointLoaded not fired. ' + _loadDiag());
    }
  }, FLUTTER_LOAD_TIMEOUT_MS);

  // Flutter rendered its first frame (the loading overlay is closed here; this also logs and acts as a fallback)
  window.addEventListener('flutter-first-frame', function () {
    logProgress('First frame rendered (flutter-first-frame)');
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (loadingEl) { logProgress('Closing loading overlay'); loadingEl.remove(); loadingEl = null; }
  });

  // Guard: if the FlutterLoader failed to load or was blocked (404 / MIME / CSP), report it instead of throwing a ReferenceError
  if (!window._flutter || !_flutter.loader) {
    showFatalError('FlutterLoader not loaded or blocked (check 404 / MIME type / CSP).');
    return;
  }

  // No service worker is used. The entrypoint is content-hashed at build time
  // (main.<hash>.js) and served with Cache-Control: immutable, so unchanged
  // builds are served from the browser's HTTP cache across boots without any SW.
  // canvaskit / assets / fonts are handled by the local server's cache headers.

  // Use FlutterLoader.load (the modern, non-deprecated API). _flutter.buildConfig is set by the
  // flutter_build_config token above (do NOT write it here with double braces — the build substitutes
  // tokens inside comments too), so .load() works (calling it from a bare flutter.js throws
  // "FlutterLoader.load requires _flutter.buildConfig to be set").
  // serviceWorkerSettings is intentionally omitted (deprecated in the loader):
  // caching is handled by content-hash + server cache headers, not a SW.
  logProgress('FlutterLoader ready, calling load to fetch main.js');
  try {
    _flutter.loader.load({
      // Use the canvaskit files shipped next to this app (canvaskit/ dir) instead
      // of the gstatic CDN. The CDN default is wrong for the embedded WebView:
      // the local HTTP server already serves canvaskit.wasm (7MB) from disk, and
      // offline / weak-network installs have no access to gstatic at all.
      config: {
        canvasKitBaseUrl: 'canvaskit/'
      },
      onEntrypointLoaded: function (engineInitializer) {
        entrypointReady = true;
        logProgress('Entrypoint loaded (onEntrypointLoaded), initializing engine');
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        // Do not close the loading overlay here: onEntrypointLoaded only means the script has been downloaded,
        // the UI has not rendered yet. The overlay is closed on flutter-first-frame (first rendered frame).
        // Second-stage watchdog: if the first frame hasn't rendered within FLUTTER_FIRST_FRAME_TIMEOUT_MS,
        // surface an error instead of spinning forever. (Cleared by the flutter-first-frame listener and showFatalError.)
        timeoutId = setTimeout(function () {
          if (loadingEl) {
            showFatalError('First frame did not render within ' +
                           (FLUTTER_FIRST_FRAME_TIMEOUT_MS / 1000) +
                           's after the entrypoint loaded.');
          }
        }, FLUTTER_FIRST_FRAME_TIMEOUT_MS);
        engineInitializer.initializeEngine().then(function (appRunner) {
          logProgress('initializeEngine done, calling runApp');
          return appRunner.runApp();
        }).catch(function (err) {
          showFatalError('Engine init failed: ' + (err && err.message ? err.message : err));
        });
      }
    });
  } catch (err) {
    showFatalError('Loader error: ' + (err && err.message ? err.message : err));
  }
})();
