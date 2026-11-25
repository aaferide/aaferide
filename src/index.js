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

    return new Response("Introuvable", { status: 404 });
  },
};
