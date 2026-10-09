// Protège les routes d'administration (génération/révocation de clés)
// avec un secret partagé, passé dans l'en-tête X-Admin-Secret.
function adminAuth(req, res, next) {
  const provided = req.header('X-Admin-Secret');
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_SECRET non configuré sur le serveur' });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

module.exports = adminAuth;
