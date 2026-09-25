/* PlayVault — where the Drive copy lives, and who may write it.

   PlayVault is a GameHub game: the values below follow CardVerse's
   docs/GAMEHUB.md, which is the canonical note on all of this.

   Both values are safe to publish, and are meant to be. An OAuth client ID
   is not a secret — it only names the app; Google hands out no token without
   the player signing in and agreeing, and only to the web addresses
   registered against it. What must NEVER appear here is a client secret. The
   browser flow this uses does not need one; needing one means the wrong kind
   of credential was made. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.DriveConfig = Object.freeze({
    /* The shared GameHub client — the same string as in every GameHub game.
       The consent screen's name is set per Cloud project, and `drive.file` is
       granted per client, so one client is what gives every game one sign-in
       that says "GameHub" and one folder under one grant. Its one registered
       origin is https://kaonhew02.github.io, which covers every Pages repo on
       the account — so nothing needed registering for PlayVault. */
    clientId: '612843079573-ujp69s8asq895kofufsb84j372qrhl9f.apps.googleusercontent.com',

    /* A folder NAME, not an id. It is looked up in whichever Drive just signed
       in and made there the first time, so every player gets their own folder
       in their own Drive, and nobody can reach anybody else's. */
    folderName: 'GameHub',

    /* What keeps this game's save apart from the other games in that folder,
       so it must be unique across GameHub. Renaming it later orphans every
       copy already written under the old name. */
    filename: 'playvault-data.json'
  });

})(window.PV);
