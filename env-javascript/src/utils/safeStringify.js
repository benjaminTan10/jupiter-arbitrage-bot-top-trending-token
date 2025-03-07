/**
 * Safely stringify objects that might contain circular references
 * @param {Object} obj - Object to stringify
 * @returns {String} JSON string
 */
function safeStringify(obj, indent = 2) {
  const cache = new Set();
  
  return JSON.stringify(obj, (key, value) => {
    // Skip connection, socket, and other complex objects that might have circular references
    if (key === 'connection' || key === '_events' || key === 'socket' || key === 'context') {
      return '[Connection Object]';
    }

    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular]';
      }
      cache.add(value);
    }
    return value;
  }, indent);
}

module.exports = safeStringify; 