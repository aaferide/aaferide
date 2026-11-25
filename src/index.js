export default {
  async fetch(request) {
    const url = new URL(request.url);

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
