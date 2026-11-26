const SYSTEM = "Tu es Feride AI, un assistant professionnel. Tu réponds en français sauf si l'utilisateur écrit dans une autre langue. Analyse la question étape par étape, sois précis, direct et utile. Pour les tâches techniques, donne des étapes claires.";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feride AI</title>
<style>
body{font-family:sans-serif;margin:0;display:flex;flex-direction:column;height:100dvh;background:#f4f5f7}
h1{margin:0;padding:14px;background:#0b5cff;color:#fff;font-size:18px}
#log{flex:1;overflow-y:auto;padding:12px}
.moi{text-align:right;margin:10px 0}
.moi span{display:inline-block;background:#0b5cff;color:#fff;padding:10px 14px;border-radius:16px;max-width:85%;white-space:pre-wrap;text-align:left}
.ia{text-align:left;margin:10px 0}
.ia span{display:inline-block;background:#fff;color:#111;padding:10px 14px;border-radius:16px;max-width:85%;white-space:pre-wrap}
form{display:flex;gap:8px;padding:8px;background:#fff}
input{flex:1;padding:12px;font-size:16px;border:1px solid #ccc;border-radius:10px}
button{padding:12px 18px;background:#0b5cff;color:#fff;border:0;border-radius:10px;font-size:16px}
</style>
</head>
<body>
<h1>Feride AI</h1>
<div id="log"></div>
<form id="f"><input id="q" placeholder="Écris ton message..." autocomplete="off"><button>Envoyer</button></form>
<script>
var log=document.getElementById('log'),inp=document.getElementById('q'),hist=[];
var NL=String.fromCharCode(10);
function add(c,t){var d=document.createElement('div');d.className=c;var s=document.createElement('span');s.textContent=t;d.appendChild(s);log.appendChild(d);log.scrollTop=log.scrollHeight;return s;}
document.getElementById('f').onsubmit=async function(e){
 e.preventDefault();
 var t=inp.value.trim(); if(!t)return; inp.value='';
 add('moi',t); hist.push({role:'user',content:t});
 var el=add('ia','...'), full='';
 try{
  var r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:hist})});
  var rd=r.body.getReader(), dec=new TextDecoder(), buf='';
  while(true){
   var x=await rd.read(); if(x.done)break;
   buf+=dec.decode(x.value,{stream:true});
   var lines=buf.split(NL); buf=lines.pop();
   for(var i=0;i<lines.length;i++){
    var l=lines[i]; if(l.indexOf('data: ')!==0)continue;
    var d=l.slice(6); if(d==='[DONE]')continue;
    try{full+=JSON.parse(d).response||'';el.textContent=full;log.scrollTop=log.scrollHeight;}catch(err){}
   }
  }
 }catch(err){el.textContent='Erreur : '+err.message;}
 hist.push({role:'assistant',content:full});
};
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const history = (body.messages || []).slice(-20);
      const stream = await env.AI.run(MODEL, {
        messages: [{ role: "system", content: SYSTEM }, ...history],
        stream: true,
        max_tokens: 1024
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response(PAGE, { headers: { "content-type": "text/html;charset=utf-8" } });
  }
};
