require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { init } = require('./db/db');
const licenseRoutes = require('./routes/license');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());

// Page web (admin.html) pour générer/consulter/révoquer les clés sans Postman
app.use(express.static(path.join(__dirname, 'public')));

// Limite les tentatives de brute-force sur les clés publiques
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'license-server' });
});

app.use('/api', publicLimiter, licenseRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`License server démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Impossible d\'initialiser la base de données:', err);
    process.exit(1);
  });
