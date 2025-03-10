const fs = require('fs');
const path = require('path');

// Path to the rpc-websockets package.json
const packagePath = path.resolve('./node_modules/rpc-websockets/package.json');

try {
  // Check if the file exists first
  if (!fs.existsSync(packagePath)) {
    console.log('rpc-websockets package.json not found. The package may not be installed.');
    process.exit(0);
  }

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
  console.error('Warning: Could not fix rpc-websockets:', error.message);
  // Don't exit with error to allow installation to continue
} 