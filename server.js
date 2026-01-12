const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve the main HTML file for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the cleaning schedule app
app.get('/cleaning', (req, res) => {
  res.sendFile(path.join(__dirname, 'Homecleaning', 'cleaning-schedule.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`🐾 Dogwalker server running on port ${PORT}`);
  console.log(`📱 Main app: http://localhost:${PORT}`);
  console.log(`🧹 Cleaning app: http://localhost:${PORT}/cleaning`);
});
