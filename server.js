require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');

const licenseRoutes = require('./routes/license');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());

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
app.listen(PORT, () => {
  console.log(`License server démarré sur le port ${PORT}`);
});
