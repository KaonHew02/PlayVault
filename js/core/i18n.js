/* PlayVault — languages.

   English + 简体中文, one flat dict per language, English first, key-by-key
   fallback. Two rules carried over from CardVerse:

   1. UI text goes through PV.t(). Data names (game titles, blurbs) do NOT —
      localize() writes translations into the registry objects in place and
      keeps the English in __en_<prop>, so screens keep reading game.name.
   2. t must be looked up lazily inside a module — `const t = k => PV.t(k)` —
      never captured at module scope, because i18n.js may load after the file
      using it and a captured undefined never recovers.

   Language is a device preference: its own key, outside the backup envelope. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DICT = {
    en: {
      'app.tagline': 'One Hub. Endless Games.',

      'nav.lobby': 'Games',
      'nav.stats': 'Stats',
      'nav.settings': 'Settings',
      'nav.back': 'Back',

      'family.board': 'Board',
      'family.puzzle': 'Puzzle',
      'family.arcade': 'Arcade',
      'family.all': 'All',

      'lobby.play': 'Play',
      'lobby.soon': 'Coming soon',
      'lobby.soonHint': 'Not built yet.',
      'lobby.empty': 'Nothing here yet.',

      'profile.level': 'Level',
      'profile.xp': 'XP',
      'profile.next': '{n} XP to level {lvl}',
      'profile.player': 'Player',
      'profile.rename': 'Change name',
      'profile.namePrompt': 'What should we call you?',

      'stats.title': 'Statistics',
      'stats.overview': 'Overview',
      'stats.game': 'Game',
      'stats.played': 'Played',
      'stats.won': 'Won',
      'stats.best': 'Best',
      'stats.time': 'Time played',
      'stats.empty': 'Play something and it will show up here.',
      'stats.totalGames': 'Games played',
      'stats.totalTime': 'Time played',
      'stats.reset': 'Reset statistics',
      'stats.resetAsk': 'Erase every record and start over? This cannot be undone.',

      'settings.title': 'Settings',
      'settings.appearance': 'Appearance',
      'settings.theme': 'Theme',
      'settings.dark': 'Dark',
      'settings.light': 'Light',
      'settings.language': 'Language',
      'settings.data': 'Your data',
      'settings.dataHint': 'Everything is stored in this browser. Export a copy before clearing site data or moving to another device.',
      'settings.export': 'Export save',
      'settings.import': 'Import save',
      'settings.importOk': 'Restored {n} store(s).',
      'settings.importBadFormat': 'That file is not a PlayVault save.',
      'settings.importBadJson': 'That file could not be read.',
      'settings.about': 'About',
      'settings.aboutText': 'PlayVault runs entirely in your browser. No account, no server, nothing sent anywhere.',

      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.newGame': 'New game',
      'common.restart': 'Restart',
      'common.undo': 'Undo',
      'common.hint': 'Hint',
      'common.pause': 'Pause',
      'common.resume': 'Resume',
      'common.quit': 'Quit',
      'common.you': 'You',
      'common.time': 'Time',
      'common.score': 'Score',
      'common.level': 'Level',
      'common.best': 'Best',
      'common.moves': 'Moves',
      'common.difficulty': 'Difficulty',
      'common.seed': 'Seed',
      'common.copy': 'Copy',
      'common.copied': 'Copied',
      'common.start': 'Start',

      'diff.easy': 'Easy',
      'diff.normal': 'Normal',
      'diff.hard': 'Hard',
      'diff.expert': 'Expert',

      'result.win': 'You win',
      'result.lose': 'You lose',
      'result.draw': 'Draw',
      'result.solved': 'Solved',
      'result.gameOver': 'Game over',
      'result.again': 'Play again',
      'result.toLobby': 'Back to games',
      'result.newBest': 'New best',
      'result.someoneWins': '{who} wins',

      'gomoku.mode': 'Opponent',
      'gomoku.vsAI': 'Computer',
      'gomoku.hotseat': 'Two players',
      'gomoku.black': 'Black',
      'gomoku.white': 'White',
      'gomoku.turn': '{who} to play',
      'gomoku.thinking': 'Thinking…',
      'gomoku.youAre': 'You are {colour}',

      'sudoku.notes': 'Notes',
      'sudoku.erase': 'Erase',
      'sudoku.mistakes': 'Mistakes',
      'sudoku.hintsLeft': '{n} left',
      'sudoku.check': 'Check',
      'sudoku.allGood': 'No mistakes so far.',
      'sudoku.someWrong': '{n} cell(s) are wrong.',
      'sudoku.noHints': 'No hints left.',

      'tetris.lines': 'Lines',
      'tetris.next': 'Next',
      'tetris.hold': 'Hold',
      'tetris.controls': 'Arrows move · Up rotates · Space hard drop · C hold · P pause',
      'tetris.touchHint': 'Swipe to move, tap to rotate, swipe down to drop.'
    },

    zh: {
      'app.tagline': '一个中心，无尽游戏。',

      'nav.lobby': '游戏',
      'nav.stats': '统计',
      'nav.settings': '设置',
      'nav.back': '返回',

      'family.board': '棋类',
      'family.puzzle': '益智',
      'family.arcade': '街机',
      'family.all': '全部',

      'lobby.play': '开始',
      'lobby.soon': '敬请期待',
      'lobby.soonHint': '尚未开放。',
      'lobby.empty': '暂时没有内容。',

      'profile.level': '等级',
      'profile.xp': '经验',
      'profile.next': '距离 {lvl} 级还需 {n} 经验',
      'profile.player': '玩家',
      'profile.rename': '修改名字',
      'profile.namePrompt': '你想叫什么名字？',

      'stats.title': '统计',
      'stats.overview': '总览',
      'stats.game': '游戏',
      'stats.played': '局数',
      'stats.won': '胜利',
      'stats.best': '最佳',
      'stats.time': '游戏时长',
      'stats.empty': '玩几局，这里就会有记录。',
      'stats.totalGames': '总局数',
      'stats.totalTime': '总时长',
      'stats.reset': '清空统计',
      'stats.resetAsk': '清除所有记录并重新开始？此操作无法撤销。',

      'settings.title': '设置',
      'settings.appearance': '外观',
      'settings.theme': '主题',
      'settings.dark': '深色',
      'settings.light': '浅色',
      'settings.language': '语言',
      'settings.data': '你的数据',
      'settings.dataHint': '所有数据都保存在本浏览器中。清除网站数据或更换设备前，请先导出备份。',
      'settings.export': '导出存档',
      'settings.import': '导入存档',
      'settings.importOk': '已恢复 {n} 项数据。',
      'settings.importBadFormat': '这不是 PlayVault 的存档文件。',
      'settings.importBadJson': '无法读取该文件。',
      'settings.about': '关于',
      'settings.aboutText': 'PlayVault 完全在你的浏览器中运行。无需账号，没有服务器，不会上传任何数据。',

      'common.cancel': '取消',
      'common.close': '关闭',
      'common.newGame': '新游戏',
      'common.restart': '重新开始',
      'common.undo': '撤销',
      'common.hint': '提示',
      'common.pause': '暂停',
      'common.resume': '继续',
      'common.quit': '退出',
      'common.you': '你',
      'common.time': '时间',
      'common.score': '分数',
      'common.level': '等级',
      'common.best': '最佳',
      'common.moves': '步数',
      'common.difficulty': '难度',
      'common.seed': '种子',
      'common.copy': '复制',
      'common.copied': '已复制',
      'common.start': '开始',

      'diff.easy': '简单',
      'diff.normal': '普通',
      'diff.hard': '困难',
      'diff.expert': '专家',

      'result.win': '你赢了',
      'result.lose': '你输了',
      'result.draw': '平局',
      'result.solved': '完成',
      'result.gameOver': '游戏结束',
      'result.again': '再玩一局',
      'result.toLobby': '返回游戏列表',
      'result.newBest': '新纪录',
      'result.someoneWins': '{who}获胜',

      'gomoku.mode': '对手',
      'gomoku.vsAI': '电脑',
      'gomoku.hotseat': '双人对战',
      'gomoku.black': '黑棋',
      'gomoku.white': '白棋',
      'gomoku.turn': '轮到{who}',
      'gomoku.thinking': '思考中…',
      'gomoku.youAre': '你执{colour}',

      'sudoku.notes': '笔记',
      'sudoku.erase': '擦除',
      'sudoku.mistakes': '错误',
      'sudoku.hintsLeft': '剩 {n} 次',
      'sudoku.check': '检查',
      'sudoku.allGood': '目前没有错误。',
      'sudoku.someWrong': '有 {n} 格填错了。',
      'sudoku.noHints': '没有提示次数了。',

      'tetris.lines': '消行',
      'tetris.next': '下一个',
      'tetris.hold': '暂存',
      'tetris.controls': '方向键移动 · 上键旋转 · 空格速降 · C 暂存 · P 暂停',
      'tetris.touchHint': '滑动移动，点击旋转，下滑速降。'
    }
  };

  const LANG_KEY = 'lang';          // its own key, outside the backup envelope
  const NAMES = { en: 'English', zh: '简体中文' };
  let lang = 'en';

  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  }

  PV.I18n = {
    LANGS: Object.keys(DICT),
    name: code => NAMES[code] || code,
    get lang() { return lang; },

    init() {
      const saved = PV.Store.get(LANG_KEY, null);
      const guess = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      lang = DICT[saved] ? saved : guess;
      return lang;
    },

    set(code) {
      if (!DICT[code]) return;
      lang = code;
      PV.Store.set(LANG_KEY, code);
      PV.I18n.apply();
      document.dispatchEvent(new CustomEvent('pv:lang', { detail: { lang: code } }));
    },

    /** Walk static markup carrying data-i18n hooks; no screen re-renders it. */
    apply() {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      PV.$$('[data-i18n]').forEach(n => { n.textContent = PV.t(n.getAttribute('data-i18n')); });
      PV.$$('[data-i18n-attr]').forEach(n => {
        const [attr, key] = n.getAttribute('data-i18n-attr').split(':');
        n.setAttribute(attr, PV.t(key));
      });
    },

    /**
     * Translate data objects in place, keeping the English in __en_<prop>.
     * Lossless both ways, so it is safe to call on every language change.
     */
    localize(objs, props) {
      for (const o of objs) {
        for (const prop of props) {
          const enKey = '__en_' + prop;
          if (!(enKey in o)) o[enKey] = o[prop];
          const zh = o[prop + 'Zh'];
          o[prop] = (lang === 'zh' && zh) ? zh : o[enKey];
        }
      }
      return objs;
    }
  };

  /** Key-by-key fallback to English, then to the key itself. */
  PV.t = function (key, params) {
    const d = DICT[lang] || DICT.en;
    const s = (key in d) ? d[key] : (key in DICT.en ? DICT.en[key] : key);
    return fill(s, params);
  };

})(window.PV);
