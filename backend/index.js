const express = require('express');
const path = require('path');
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const artisanRoutes = require('./routes/artisan');
const userRoutes = require('./routes/user');
const app = require('./server');

// Try different ports if the default one is in use
const tryPort = (port) => {
  app.listen(port)
    .on('listening', () => {
      console.log(`Serveur démarré sur http://localhost:${port}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is already in use, trying ${port + 1}...`);
        tryPort(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
};

// Définition du port
const port = process.env.PORT || 3001;

app.use('/auth', authRoutes);
app.use('/client', clientRoutes);
app.use('/artisan', artisanRoutes);
app.use('/', userRoutes);

tryPort(port);