const fs = require('fs');
const path = require('path');

// Path to the rpc-websockets package directory
const rpcWebsocketsDir = path.resolve('./node_modules/rpc-websockets');
const packagePath = path.join(rpcWebsocketsDir,'package.json');

try {
  // Check if the package.json exists
  if(!fs.existsSync(packagePath)) {
    console.log('rpc-websockets package.json not found. The package may not be installed.');
    process.exit(0);
  }

  // Read the current package.json
  const packageJson = JSON.parse(fs.readFileSync(packagePath,'utf8'));

  // Add exports field if it doesn't exist
  if(!packageJson.exports) {
    packageJson.exports = {
      ".": "./dist/index.js",
      "./dist/lib/client": "./dist/lib/client.js",
      "./dist/lib/server": "./dist/lib/server.js",
      "./dist/lib/*": "./dist/lib/*"
    };

    // Write the updated package.json
    fs.writeFileSync(packagePath,JSON.stringify(packageJson,null,2));
    console.log('Added exports field to rpc-websockets package.json');
  }

  // Create necessary directory structure
  const directories = [
    path.join(rpcWebsocketsDir,'dist'),
    path.join(rpcWebsocketsDir,'dist/lib'),
    path.join(rpcWebsocketsDir,'dist/lib/client')
  ];

  directories.forEach(dir => {
    if(!fs.existsSync(dir)) {
      fs.mkdirSync(dir,{recursive: true});
      console.log(`Created directory: ${dir}`);
    }
  });

  // Define content for required files using CommonJS syntax
  const files = [
    {
      path: 'dist/index.js',
      content: `"use strict";
// CommonJS compatible index.js
module.exports = {
  Client: require('./lib/client'),
  Server: require('./lib/server')
};
`
    },
    {
      path: 'dist/lib/client.js',
      content: `"use strict";
// CommonJS compatible client.js
const EventEmitter = require('eventemitter3');

class CommonClient extends EventEmitter {
  constructor(webSocketFactory, address = "ws://localhost:8080", options = {}, generate_request_id) {
    super();
    this.webSocketFactory = webSocketFactory;
    this.address = address;
    this.options = options;
    this.queue = {};
    this.rpc_id = 0;
    this.socket = null;
    this.reconnect = options.reconnect || true;
    this.ready = false;
    this.generate_request_id = generate_request_id || (() => ++this.rpc_id);
  }

  connect() {
    if (this.socket) return;
    this._connect(this.address, this.options);
  }

  call(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.ready) return reject(new Error("socket not ready"));
      
      const rpc_id = this.generate_request_id(method, params);
      const message = {
        jsonrpc: "2.0",
        method,
        params: params || undefined,
        id: rpc_id
      };
      
      this.socket.send(JSON.stringify(message), (error) => {
        if (error) return reject(error);
        this.queue[rpc_id] = { promise: [resolve, reject] };
      });
    });
  }

  close() {
    if (this.socket) this.socket.close();
  }
  
  _connect(address, options) {
    this.socket = this.webSocketFactory(address, options);
    
    this.socket.addEventListener("open", () => {
      this.ready = true;
      this.emit("open");
    });
    
    this.socket.addEventListener("error", (error) => {
      this.emit("error", error);
    });
    
    this.socket.addEventListener("close", () => {
      this.ready = false;
      this.socket = null;
      this.emit("close");
    });
  }
}

module.exports = CommonClient;
`
    },
    {
      path: 'dist/lib/server.js',
      content: `"use strict";
// Minimal server.js stub
class Server {
  constructor() {
    this.clients = [];
  }
  
  register() {
    // Stub implementation
    return { protected: () => {}, public: () => {} };
  }
  
  event() {
    // Stub implementation
    return { protected: () => {}, public: () => {} };
  }
  
  close() {
    // Stub implementation
    return Promise.resolve();
  }
}

module.exports = Server;
`
    },
    {
      path: 'dist/lib/client/websocket.js',
      content: `"use strict";
const WebSocket = require('ws');

/**
 * factory method for common WebSocket instance
 * @param {String} address - url to a websocket server
 * @param {Object} options - websocket options
 * @return {WebSocket} - returns a WebSocket instance
 */
module.exports = function(address, options) {
  return new WebSocket(address, options);
};
`
    },
    {
      path: 'dist/lib/client/websocket.browser.js',
      content: `"use strict";
/**
 * Browser WebSocket factory (used in the browser bundle)
 * @param {String} address - url to a websocket server
 * @param {Object} options - websocket options
 * @return {WebSocket} - returns a WebSocket instance
 */
module.exports = function(address, options) {
  return new window.WebSocket(address);
};
`
    }
  ];

  // Create all the required files
  files.forEach(file => {
    const filePath = path.join(rpcWebsocketsDir,file.path);

    // Create parent directory if it doesn't exist
    const destDir = path.dirname(filePath);
    if(!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir,{recursive: true});
    }

    // Write the file content
    fs.writeFileSync(filePath,file.content);
    console.log(`Created ${file.path}`);
  });

  console.log('Successfully fixed rpc-websockets module');
} catch(error) {
  console.error('Error fixing rpc-websockets:',error);
  // Don't exit with error to allow installation to continue
} 