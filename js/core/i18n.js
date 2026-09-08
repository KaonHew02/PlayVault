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
      'tetris.touchHint': 'Swipe to move, tap to rotate, swipe down to drop.',

      'reversi.passed': '{who} has no move',

      'chess.white': 'White',
      'chess.black': 'Black',
      'chess.check': 'Check',
      'chess.checkmate': 'Checkmate',
      'chess.stalemate': 'Stalemate',
      'chess.fifty-move': 'Fifty-move rule',
      'chess.material': 'Not enough material',
      'chess.repetition': 'Threefold repetition',
      'chess.idle': 'No capture in sixty moves',
      'chess.promote': 'Promote to',

      'xiangqi.red': 'Red',
      'xiangqi.black': 'Black',

      'snake.length': 'Length',
      'snake.speed': 'Speed',
      'snake.calm': 'Calm',
      'snake.fast': 'Fast',
      'snake.edges': 'Edges',
      'snake.solid': 'Walls',
      'snake.wrap': 'Wrap around',
      'snake.controls': 'Arrows or WASD to turn.',
      'snake.perfect': 'Perfect game',

      'worms.mass': 'Mass',
      'worms.length': 'Length',
      'worms.rank': 'Rank',
      'worms.leaders': 'Leaders',
      'worms.you': 'You',
      'worms.crowd': 'Crowd',
      'worms.quiet': 'Quiet',
      'worms.busy': 'Busy',
      'worms.controls': 'Steer with the mouse or ← →. Hold the left button, or Space, to dash — a dash spends mass.',
      'worms.eaten': 'You ran into another worm',
      'worms.hitWall': 'You hit the wall',

      'spider.suitsLabel': 'Suits',
      'spider.suits1': 'One suit',
      'spider.suits2': 'Two suits',
      'spider.suits4': 'Four suits',
      'spider.sets': 'Sets',
      'spider.deals': 'Deals left',
      'spider.noDeals': 'The stock is empty.',
      'spider.emptyColumn': 'Every column must hold a card before you deal.',
      'spider.hintDeal': 'Nothing worth moving — deal a new row.',
      'spider.stuck': 'No moves left and nothing to deal.',

      'mahjong.shuffle': 'Shuffle',
      'mahjong.shuffled': 'Tiles reshuffled.',
      'mahjong.noShuffle': 'No shuffle helps here.',
      'mahjong.stuck': 'No moves left - try a shuffle or undo.',
      'mahjong.blocked': 'That tile is blocked.',
      'mahjong.left': 'Left',
      'mahjong.moves': 'Moves',
      'mahjong.shuffles': 'Shuffles used',

      'racing.lap': 'Lap',
      'racing.place': 'Position',
      'racing.best': 'Best lap',
      'racing.controls': 'Arrows or WASD - up to accelerate, down to brake. '
        + 'Shift drifts for a boost, Space fires your item.',
      'racing.item': 'Item',
      'racing.none': 'Empty',
      'racing.mushroom': 'Mushroom',
      'racing.banana': 'Banana',
      'racing.shell': 'Shell',
      'racing.lightning': 'Lightning',
      'racing.kart': 'Kart',
      'racing.light': 'Light',
      'racing.medium': 'Medium',
      'racing.heavy': 'Heavy',
      'racing.track': 'Circuit',
      'racing.ring': 'The Ring',
      'racing.circuit': 'Old Town',
      'racing.laps': 'Laps',
      'racing.laps2': '2',
      'racing.laps3': '3',
      'racing.laps5': '5',
      'racing.won': 'First place',
      'racing.placed': 'Finished {n}th',

      'td.wave': 'Wave',
      'td.lives': 'Lives',
      'td.money': 'Gold',
      'td.startWave': 'Send next wave',
      'td.startIn': 'Next wave in {n}s - send now',
      'td.gun': 'Gun',
      'td.frost': 'Frost',
      'td.cannon': 'Cannon',
      'td.upgrade': 'Upgrade',
      'td.sell': 'Sell',
      'td.maxLevel': 'Fully upgraded',
      'td.damage': 'Damage',
      'td.range': 'Range',
      'td.hint': 'Pick a tower, then tap a green square. Tap a tower to upgrade it.',
      'td.cleared': 'All waves held',
      'td.overrun': 'Overrun',
      'td.killed': 'Killed',
      'td.leaked': 'Leaked',
      'td.map': 'Map',
      'td.meadow': 'Meadow',
      'td.canyon': 'Canyon',
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
      'tetris.touchHint': '滑动移动，点击旋转，下滑速降。',

      'reversi.passed': '{who}无子可下',

      'chess.white': '白方',
      'chess.black': '黑方',
      'chess.check': '将军',
      'chess.checkmate': '将死',
      'chess.stalemate': '逼和',
      'chess.fifty-move': '五十步规则',
      'chess.material': '子力不足',
      'chess.repetition': '三次重复局面',
      'chess.idle': '六十回合无吃子',
      'chess.promote': '升变为',

      'xiangqi.red': '红方',
      'xiangqi.black': '黑方',

      'snake.length': '长度',
      'snake.speed': '速度',
      'snake.calm': '悠闲',
      'snake.fast': '快速',
      'snake.edges': '边界',
      'snake.solid': '撞墙',
      'snake.wrap': '穿墙',
      'snake.controls': '方向键或 WASD 转向。',
      'snake.perfect': '完美通关',

      'worms.mass': '体量',
      'worms.length': '长度',
      'worms.rank': '排名',
      'worms.leaders': '排行榜',
      'worms.you': '你',
      'worms.crowd': '数量',
      'worms.quiet': '清静',
      'worms.busy': '拥挤',
      'worms.controls': '用鼠标或 ← → 控制方向，按住鼠标左键或空格冲刺，冲刺会消耗体量。',
      'worms.eaten': '撞上了别的蠕虫',
      'worms.hitWall': '撞到了边界',

      'spider.suitsLabel': '花色',
      'spider.suits1': '单花色',
      'spider.suits2': '双花色',
      'spider.suits4': '四花色',
      'spider.sets': '已完成',
      'spider.deals': '剩余发牌',
      'spider.noDeals': '牌堆已经发完。',
      'spider.emptyColumn': '有空列时不能发牌。',
      'spider.hintDeal': '没有值得走的牌，发一行吧。',
      'spider.stuck': '没有可走的牌，也没有牌可发。',

      'mahjong.shuffle': '重排',
      'mahjong.shuffled': '牌已重排。',
      'mahjong.noShuffle': '重排也无解。',
      'mahjong.stuck': '没有可配对的牌了，试试重排或撤销。',
      'mahjong.blocked': '这张牌被压住了。',
      'mahjong.left': '剩余',
      'mahjong.moves': '可配对',
      'mahjong.shuffles': '重排次数',

      'racing.lap': '圈数',
      'racing.place': '名次',
      'racing.best': '最快单圈',
      'racing.controls': '方向键或 WASD，上加速，下刹车；Shift 漂移蓄力，空格使用道具。',
      'racing.item': '道具',
      'racing.none': '空',
      'racing.mushroom': '蘑菇加速',
      'racing.banana': '香蕉皮',
      'racing.shell': '龟壳',
      'racing.lightning': '闪电',
      'racing.kart': '车型',
      'racing.light': '轻型',
      'racing.medium': '中型',
      'racing.heavy': '重型',
      'racing.track': '赛道',
      'racing.ring': '环形道',
      'racing.circuit': '老城区',
      'racing.laps': '圈数',
      'racing.laps2': '2',
      'racing.laps3': '3',
      'racing.laps5': '5',
      'racing.won': '冠军',
      'racing.placed': '第 {n} 名',

      'td.wave': '波次',
      'td.lives': '生命',
      'td.money': '金币',
      'td.startWave': '开始下一波',
      'td.startIn': '{n} 秒后开始，点此提前',
      'td.gun': '机枪塔',
      'td.frost': '冰霜塔',
      'td.cannon': '加农炮',
      'td.upgrade': '升级',
      'td.sell': '出售',
      'td.maxLevel': '已满级',
      'td.damage': '伤害',
      'td.range': '射程',
      'td.hint': '先选一种塔，再点击绿色空地。点击已建成的塔可以升级。',
      'td.cleared': '成功守住全部波次',
      'td.overrun': '防线失守',
      'td.killed': '击杀',
      'td.leaked': '漏过',
      'td.map': '地图',
      'td.meadow': '草原',
      'td.canyon': '峡谷',
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
