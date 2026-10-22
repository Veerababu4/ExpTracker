// Local workaround (developer laptop only): the home router's DNS refuses lookups for *.neon.tech. For the Node
// process that preloads this file (node --import / NODE_OPTIONS), those names are resolved through public DNS
// (Cloudflare, Google), IPv4 only. Every other name and the Windows settings stay as they are. The live site on
// Vercel never loads it.
import dns from "node:dns";

const resolver = new dns.Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
const systemLookup = dns.lookup;

dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  if (typeof options === "number") options = { family: options };
  if (!/\.neon\.tech$/i.test(hostname)) return systemLookup.call(dns, hostname, options, callback);
  resolver.resolve4(hostname, (error, addresses) => {
    if (error) return callback(error);
    if (options && options.all) return callback(null, addresses.map((address) => ({ address, family: 4 })));
    return callback(null, addresses[0], 4);
  });
};
