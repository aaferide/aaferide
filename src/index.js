const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feride AI</title>
<style>
body{font-family:sans-serif;margin:0;display:flex;flex-direction:column;height:100vh}
h1{margin:0;padding:12px;background:#4f46e5;color:#fff;font-size:18px}
#log{flex:1;overflow-y:auto;padding:12px}
.moi{text-align:right;margin:8px 0}
.ia{text-align:left;margin:8px 0;color:#4f46e5}
form{display:flex;gap:8px;padding:8px;border-top:1px solid #ccc}
input{flex:1;padding:10px;font-size:16px}
button{padding:10px 16px;font-size:16px}
</style>
</head>
<body>
<h1>Feride AI</h1>
<div id="log"></div>
<form id="f">
<input id="m" placeholder="Écris un message..." autocomplete="off">
<button type="submit">Envoyer</button>
</form>
<script>
var log = document.getElementById("log");
var champ = document.getElementById("m");
function ajouter(classe, texte) {
  var d = document.createElement("div");
  d.className = classe;
  d.textContent = texte;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
document.getElementById("f").addEventListener("submit", async function (e) {
  e.preventDefault();
  var texte = champ.value.trim();
  if (!texte) return;
  ajouter("moi", texte);
  champ.value = "";
  try {
    var r = await fetch("/api/chat?message=" + encodeURIComponent(texte));
    var data = await r.json();
    ajouter("ia", data.reponse);
  } catch (err) {
    ajouter("ia", "Erreur de connexion.");
  }
});
</script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/hello") {
      return Response.json({ message: "Bonjour" });
    }

    if (url.pathname === "/api/heure") {
      return Response.json({ heure: new Date().toISOString() });
    }

    if (url.pathname === "/api/salut") {
      const nom = url.searchParams.get("nom") || "inconnu";
      return Response.json({ message: "Salut " + nom });
    }

    if (url.pathname === "/api/chat") {
      const message = (url.searchParams.get("message") || "").toLowerCase();
      let reponse = "Je n'ai pas compris.";
      if (message.includes("bonjour") || message.includes("salut")) {
        reponse = "Bonjour ! Je suis Feride AI.";
      } else if (message.includes("heure")) {
        reponse = "Il est " + new Date().toISOString() + " (UTC).";
      } else if (message.includes("nom")) {
        reponse = "Je m'appelle Feride AI.";
      }
      return Response.json({ reponse });
    }

    return new Response("Introuvable", { status: 404 });
  },
};
