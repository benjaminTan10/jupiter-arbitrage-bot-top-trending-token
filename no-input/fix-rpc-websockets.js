const fs = require('fs');
const path = require('path');

// Path to the rpc-websockets package.json
const packagePath = path.resolve('./node_modules/rpc-websockets/package.json');

try {
  // Read the current package.json
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Add exports field if it doesn't exist
  if (!packageJson.exports) {
    packageJson.exports = {
      ".": "./dist/index.js",
      "./dist/lib/client": "./dist/lib/client.js",
      "./dist/lib/server": "./dist/lib/server.js",
      "./dist/lib/*": "./dist/lib/*"
    };
    
    // Write the updated package.json
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    console.log('Fixed rpc-websockets package.json');
  } else {
    console.log('rpc-websockets package.json already has exports field');
  }
} catch (error) {
  console.error('Error fixing rpc-websockets:', error);
} 