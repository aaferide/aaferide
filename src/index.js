const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feride AI</title>
<style>
body{font-family:sans-serif;margin:0;display:flex;flex-direction:column;height:100dvh}
h1{margin:0;padding:14px;background:#4f46e5;color:#fff;font-size:20px}
#log{flex:1;overflow-y:auto;padding:12px}
.moi{text-align:right;margin:10px 0}
.moi span{display:inline-block;background:#4f46e5;color:#fff;padding:9px 14px;border-radius:16px;max-width:80%;text-align:left;white-space:pre-wrap}
.ia{text-align:left;margin:10px 0;color:#1a1d29;line-height:1.55;white-space:pre-wrap}
form{display:flex;gap:8px;padding:8px;border-top:1px solid #ddd}
input{flex:1;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:20px}
button{padding:10px 16px;font-size:16px;border:0;border-radius:20px;background:#4f46e5;color:#fff}
button:disabled{opacity:.5}
</style>
</head>
<body>
<h1>Feride AI</h1>
<div id="log"></div>
<form id="f">
<input id="t" placeholder="Écris un message..." autocomplete="off">
<button id="b">Envoyer</button>
</form>
<script>
var NL = String.fromCharCode(10);
var log = document.getElementById("log");
var form = document.getElementById("f");
var input = document.getElementById("t");
var btn = document.getElementById("b");
var chat = [];

function add(cls, text) {
  var d = document.createElement("div");
  d.className = cls;
  if (cls === "moi") {
    var s = document.createElement("span");
    s.textContent = text;
    d.appendChild(s);
  } else {
    d.textContent = text;
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

form.onsubmit = async function (e) {
  e.preventDefault();
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  add("moi", text);
  chat.push({ role: "user", content: text });
  var box = add("ia", "Feride AI réfléchit...");
  btn.disabled = true;
  var full = "";
  try {
    var r = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat })
    });
    if (!r.ok) {
      var j = await r.json();
      throw new Error(j.error || "Erreur");
    }
    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = "";
    while (true) {
      var res = await reader.read();
      if (res.done) break;
      buf += dec.decode(res.value, { stream: true });
      var lines = buf.split(NL);
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf("data: ") !== 0) continue;
        var d = line.slice(6).trim();
        if (d === "[DONE]") continue;
        try {
          var o = JSON.parse(d);
          if (o.response) {
            full += o.response;
            box.textContent = full;
            log.scrollTop = log.scrollHeight;
          }
        } catch (x) {}
      }
    }
    if (!full) box.textContent = "Pas de réponse, réessaie.";
    chat.push({ role: "assistant", content: full });
  } catch (err) {
    box.textContent = "Erreur IA : " + err.message;
    chat.pop();
  }
  btn.disabled = false;
  input.focus();
};
</script>
</body>
</html>`;

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM =
  "Tu es Feride AI, un assistant professionnel. Comprends d'abord la question, raisonne étape par étape, puis réponds en français de façon claire, structurée et précise.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        const stream = await env.AI.run(MODEL, {
          messages: [{ role: "system", content: SYSTEM }, ...history],
          stream: true,
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return new Response(PAGE, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  },
};
