/* PlayVault — the rest of the roster.

   Registered as stubs so the lobby is honest about what exists: the games are
   listed, greyed, and not clickable. Each one moves out of this file and into
   js/games/<code>/ when it is built — the lobby, statistics and save format
   need no change when it does.

   Grouped by the contract each will be built on, because that is the order
   they get cheap in. */
(function (PV) {
  'use strict';

  const icon = body => '<svg viewBox="0 0 48 48" aria-hidden="true">' + body + '</svg>';

  /* ---- family: board (the turn-based contract, already proved by gomoku) ---- */

  PV.Registry.stub({
    code: 'reversi', family: 'board',
    name: 'Reversi', nameZh: '黑白棋',
    blurb: 'Flank a line of your opponent\'s discs and every one of them turns.',
    blurbZh: '两端夹住对手的棋子，中间的全部翻面。',
    icon: icon('<rect x="7" y="7" width="34" height="34" rx="4" fill="#1E5B43" stroke="currentColor" stroke-width="1.6"/>'
      + '<circle cx="18" cy="18" r="5.2" fill="#0D1218"/><circle cx="30" cy="18" r="5.2" fill="#EAF0F7"/>'
      + '<circle cx="18" cy="30" r="5.2" fill="#EAF0F7"/><circle cx="30" cy="30" r="5.2" fill="#0D1218"/>')
  });

  PV.Registry.stub({
    code: 'chess', family: 'board',
    name: 'Chess', nameZh: '国际象棋',
    blurb: 'The full game — castling, en passant, promotion, the lot.',
    blurbZh: '完整规则：王车易位、吃过路兵、兵的升变，一样不少。',
    icon: icon('<path d="M24 9c-3 0-5 2-5 4.4 0 1.5.8 2.6 1.8 3.4-2 1-3.4 2.8-3.4 5.2h13.2c0-2.4-1.4-4.2-3.4-5.2 1-.8 1.8-1.9 1.8-3.4C29 11 27 9 24 9Z" fill="currentColor"/>'
      + '<path d="M17 24h14l-1.6 9H18.6L17 24Z" fill="currentColor"/>'
      + '<rect x="14" y="34" width="20" height="5" rx="1.8" fill="currentColor"/>')
  });

  PV.Registry.stub({
    code: 'xiangqi', family: 'board',
    name: 'Chinese Chess', nameZh: '中国象棋',
    blurb: 'River, palace, and a cannon that needs a screen to fire.',
    blurbZh: '楚河汉界，九宫困将，炮要隔子才能打。',
    icon: icon('<rect x="7" y="7" width="34" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"/>'
      + '<circle cx="24" cy="24" r="11" fill="#B34A2B" stroke="#F6B32B" stroke-width="1.8"/>'
      + '<text x="24" y="29.5" font-size="14" text-anchor="middle" font-family="serif" fill="#FFE3B0">帥</text>')
  });

  /* ---- family: puzzle (the solo contract, already proved by sudoku) ---- */

  PV.Registry.stub({
    code: 'solitaire', family: 'puzzle',
    name: 'Solitaire', nameZh: '接龙',
    blurb: 'Klondike, draw one or draw three. Only deals that can be won.',
    blurbZh: '经典空当接龙，可选翻一张或三张。只发能解开的牌局。',
    icon: icon('<rect x="9" y="12" width="17" height="24" rx="3" fill="#EAF0F7" stroke="#8494A8" stroke-width="1.2" transform="rotate(-10 17 24)"/>'
      + '<rect x="21" y="12" width="17" height="24" rx="3" fill="#FFFFFF" stroke="#8494A8" stroke-width="1.2" transform="rotate(8 29 24)"/>'
      + '<path d="M29 20l3.4 3.6c1.3 1.4 1.3 3.4 0 4.6-1.2 1.2-3 1-3.4-.2-.4 1.2-2.2 1.4-3.4.2-1.3-1.2-1.3-3.2 0-4.6L29 20Z" fill="#D8443B"/>')
  });

  PV.Registry.stub({
    code: 'mahjong', family: 'puzzle',
    name: 'Mahjong Solitaire', nameZh: '麻将连连看',
    blurb: 'Clear the layout two tiles at a time — but only the free ones.',
    blurbZh: '两两配对清空牌阵，只有两侧无阻的牌才能取。',
    icon: icon('<rect x="8" y="14" width="13" height="19" rx="2.4" fill="#F3EFE4" stroke="#8494A8" stroke-width="1.2"/>'
      + '<rect x="23" y="14" width="13" height="19" rx="2.4" fill="#F3EFE4" stroke="#8494A8" stroke-width="1.2"/>'
      + '<path d="M14.5 20v7M11 23.5h7" stroke="#2E7D5B" stroke-width="2.2" stroke-linecap="round"/>'
      + '<circle cx="29.5" cy="23.5" r="3.4" fill="none" stroke="#B34A2B" stroke-width="2.2"/>')
  });

  /* ---- family: arcade (the real-time contract, already proved by tetris) ---- */

  PV.Registry.stub({
    code: 'snake', family: 'arcade',
    name: 'Snake', nameZh: '贪吃蛇',
    blurb: 'Eat, grow, and run out of room.',
    blurbZh: '吃掉食物，越长越长，直到无路可走。',
    icon: icon('<path d="M12 34h12a6 6 0 0 0 0-12h-6a6 6 0 0 1 0-12h12" fill="none" stroke="#34D399" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="34" cy="10" r="3.4" fill="#F6B32B"/>')
  });

  PV.Registry.stub({
    code: 'racing', family: 'arcade',
    name: 'Racing', nameZh: '赛车',
    blurb: 'Top-down circuits against the clock and the field.',
    blurbZh: '俯视视角绕圈竞速，和时间与对手一起较量。',
    icon: icon('<path d="M10 32c0-8 5-16 14-16s14 8 14 16" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>'
      + '<rect x="17" y="20" width="14" height="20" rx="4" fill="#D8443B"/>'
      + '<rect x="20" y="24" width="8" height="6" rx="1.6" fill="#0D1218" opacity=".55"/>'
      + '<rect x="14" y="23" width="4" height="7" rx="1.4" fill="#0D1218"/>'
      + '<rect x="30" y="23" width="4" height="7" rx="1.4" fill="#0D1218"/>')
  });

  PV.Registry.stub({
    code: 'towerdef', family: 'arcade',
    name: 'Tower Defense', nameZh: '塔防',
    blurb: 'Build the route, hold the line, survive the wave.',
    blurbZh: '布置防线，守住路口，撑过一波又一波。',
    icon: icon('<path d="M8 36h32" stroke="currentColor" stroke-width="2" opacity=".45"/>'
      + '<path d="M14 36V20l5-4 5 4v16Z" fill="#8494A8"/>'
      + '<path d="M14 20h10M16.5 16v-3h5v3" fill="none" stroke="#8494A8" stroke-width="2"/>'
      + '<circle cx="33" cy="29" r="5" fill="#F6B32B"/>'
      + '<path d="M28 36h10" stroke="#F6B32B" stroke-width="2.6" stroke-linecap="round"/>')
  });

})(window.PV);
