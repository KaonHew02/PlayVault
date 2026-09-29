/* PlayVault — the TURN relay, for friends whose networks cannot reach each
   other directly: most mobile data, a lot of office and school Wi-Fi. STUN
   (in net.js) finds a direct path wherever one exists; where none does, the
   relay carries the traffic for both browsers. It sees only encrypted
   packets — a WebRTC data channel is encrypted end to end — never a move.

   These values are public by design. A browser-only app has to hand them to
   the browser, so anyone who opens the developer tools can read them, as with
   every browser app that uses TURN. The worst that costs is the plan's monthly
   quota; if it is ever abused, make new credentials at the provider and put
   them here. A match through a relay moves a few hundred kilobytes at most.

   Each entry is what the provider's dashboard gives, for example

     { urls: ['turn:<host>:3478', 'turn:<host>:443?transport=tcp'],
       username: '<username>', credential: '<password>' }

   net.js checks the shape and drops an entry it cannot use. Empty, play still
   works wherever a direct path exists, as it always has. Add `?relay` to the
   address to force every connection through the relay — the one way to see
   it work from two tabs on one machine, which otherwise always go direct. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.RelayConfig = Object.freeze({
    servers: Object.freeze([])
  });

})(window.PV);
