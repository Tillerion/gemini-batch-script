// ==UserScript==
// @name         Gemini Lyria Artcore 批量生成
// @namespace    local.gemini.lyria.batch
// @version      0.6
// @description  音乐/图片批量生成、秒数间隔、可控随机微调、独立提示词库与批次 ZIP。
// @match        https://gemini.google.com/app*
// @run-at       document-idle
// @noframes
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      self
// @connect      googleusercontent.com
// @connect      usercontent.google.com
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('lyria-batch-panel')) return;
  const DEFAULT_MUSIC = "Create one completely new instrumental composition with a new original central melody. Do not edit, continue, extend or remix any earlier music. No vocals, lyrics or speech.\n\nJapanese melodic Artcore, 180 BPM, rhythm game soundtrack. Emotional and breathtakingly beautiful melodies above all else. Delicate yet expressive grand piano arpeggios and lyrical piano lead; elegant solo violin and sweeping orchestral strings; intricate fast-paced breakbeats and sophisticated drum and bass rhythms; crisp electronic percussion, subtle shimmering synths, and atmospheric pads.\n\nA dreamlike, ethereal, bittersweet, slightly melancholic atmosphere blending classical elegance with futuristic electronic sound design. Intricate harmonic progressions, evolving melodic motifs, emotionally resonant chord changes, exquisite counterpoint between piano and violin, delicate ornamental notes, sparkling high frequencies, and a clean, transparent mix.\n\nBegin with a fragile, crystalline piano introduction. Gradually introduce flowing strings and atmospheric textures. Build into an emotionally powerful melodic climax with rapid rolling breakbeats, cascading piano arpeggios, and soaring violin harmonies. Include a brief atmospheric interlude before a grand, cathartic final climax. Dynamic, intricate, elegant, immersive, and deeply melodic.\n\nHigh melodic density, sophisticated composition, organic instrumental expression blended seamlessly with electronic production, strong melodic identity, memorable motifs, dramatic yet graceful progression, and a polished Japanese doujin rhythm-game aesthetic. Use flowing liquid breakbeats, tender piano themes, lyrical violin, graceful string countermelodies, bittersweet major-minor harmonies, subtle electronic textures, and restrained bass.\n\nThe melody is always the emotional centerpiece. Every instrument serves the melody. The result should be beautiful, profound, and emotionally overwhelming rather than merely loud or aggressive.";
  const KEY = 'local.gemini.batch.v2', OLD_KEY = 'local.gemini.lyria.batch.v1';
  const MODES = ['music', 'image'], TITLE = { music: '音乐', image: '图片' };
  const LIMIT = 512 * 1024 * 1024;
  const $all = (s, root = document) => [...root.querySelectorAll(s)];
  const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const uid = () => crypto.randomUUID();
  const abortError = () => new DOMException('已停止', 'AbortError');
  // RANDOM_CORE_BEGIN: variation operates only on optional clauses, never on base text.
  const DEFAULT_VARIATIONS = {
    music: [
      '轻微调整开头旋律的起伏形状，保留原有情绪与乐器配置。',
      '略微变化旋律的句尾收束方式，不改变原有曲风与速度。',
      '在少数音符处加入克制的装饰变化，保留原有旋律气质。',
      '稍微变化主奏与伴奏的回应顺序，不增加新的乐器。',
      '细微调整段落过渡的铺垫方式，保持原有结构要求。',
      '略微变化节奏重音的位置，保持原有速度与节奏风格。',
      '轻微调整已有乐器间的层次，仍以原提示词的情绪中心为主。',
      '为少量旋律乐句加入细微的呼吸感，整体表达保持一致。'
    ],
    image: [
      '稍微变化构图中的留白比例，保持主体与画风不变。',
      '略微变化次要细节的排列，保留所有指定物体和背景。',
      '在原有光线设定内，轻微变化明暗层次。',
      '稍微变化边缘与纹理的细节处理，保持原有材质要求。',
      '在既定配色范围内，轻微变化颜色的分布比例。',
      '微调前后景的层次关系，不更换场景或主体。',
      '为原有背景增加极少量细节变化，不添加新的主体。',
      '在原提示词允许的范围内，轻微变化画面节奏与视觉重心。'
    ]
  };
  function defaultRandom(mode) { return { enabled: false, strength: 1, pool: DEFAULT_VARIATIONS[mode].join('\n') }; }
  function normalizeRandom(value, mode) {
    const initial = defaultRandom(mode);
    return { enabled: value?.enabled === true, strength: value?.strength === 2 ? 2 : 1, pool: typeof value?.pool === 'string' && value.pool.length <= 20000 ? value.pool : initial.pool };
  }
  function variationPool(config) {
    return [...new Set(config.pool.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
  }
  function validateRandom(config) {
    if (!config.enabled) return;
    const pool = variationPool(config);
    if (pool.length < 2 || pool.length > 50 || pool.some(s => s.length > 500)) throw new Error('随机变化池需要 2–50 条不同要求，每条不超过 500 字。');
  }
  function randomChoice(values) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    return values[Math.floor(n / 4294967296 * values.length)];
  }
  function variedPrompt(base, config, state) {
    if (!config.enabled) return { text: base, operation: 'none', tweaks: [] };
    validateRandom(config);
    const pool = variationPool(config), previous = state.selection || [], remaining = pool.filter(s => !previous.includes(s));
    const operations = [];
    if (previous.length < config.strength && remaining.length) operations.push('add');
    if (previous.length) operations.push('remove');
    if (previous.length && remaining.length) operations.push('replace');
    const operation = randomChoice(operations), selected = [...previous];
    if (operation === 'add') selected.push(randomChoice(remaining));
    else if (operation === 'remove') selected.splice(randomChoice(selected.map((_, i) => i)), 1);
    else selected[randomChoice(selected.map((_, i) => i))] = randomChoice(remaining);
    state.selection = selected;
    const text = selected.length ? base + '\n\n[本轮微调要求]\n保持上方提示词的风格、主题和所有明确限制不变。以下只做细微变化；若有冲突，优先遵循上方要求：\n' + selected.map(s => '- ' + s).join('\n') : base;
    return { text, operation, tweaks: [...selected] };
  }
  function normalizedDelaySeconds(lib) {
    const value = typeof lib.delaySeconds === 'number' ? lib.delaySeconds : Number(lib.delay) * 60;
    return Number.isFinite(value) && value >= 0 && value <= 7200 ? Math.round(value) : 60;
  }
  // RANDOM_CORE_END
  const library = (id, name, prompt, format) => ({ selected: id, versions: [{ id, name, prompt }], trash: [], history: [], count: 5, delaySeconds: 60, recent: 3, delivery: 'zip', format, random: defaultRandom(format === 'mp3' ? 'music' : 'image') });
  function defaults() {
    return { schema: 2, mode: 'music', theme: 'dark', libraries: {
      music: library('artcore', 'Artcore · 新旋律', DEFAULT_MUSIC, 'mp3'),
      image: library('image-first', '图片 · 原创插画', '生成一张全新的原创图片：梦幻的日式幻想风景，水晶般清澈的天空，柔和光线，细腻的色彩和精致构图，无文字。每次采用新的构图，不修改或延续之前的图片。', 'original')
    } };
  }
  function validateVersions(versions) {
    if (!Array.isArray(versions) || !versions.length || versions.length > 200) throw new Error('每个模式需要 1–200 个提示词版本。');
    const ids = new Set();
    for (const v of versions) {
      if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 150 || typeof v.prompt !== 'string' || v.prompt.length > 100000) throw new Error('提示词版本格式不正确。');
      ids.add(v.id);
    }
  }
  function normalizeLibrary(lib, mode) {
    validateVersions(lib.versions);
    if (!lib.versions.some(v => v.id === lib.selected)) lib.selected = lib.versions[0].id;
    lib.trash = (Array.isArray(lib.trash) ? lib.trash : []).filter(v => v && typeof v.name === 'string' && v.name.trim() && v.name.length <= 150 && typeof v.prompt === 'string' && v.prompt.length <= 100000).slice(-20);
    lib.history = (Array.isArray(lib.history) ? lib.history : []).filter(v => v && typeof v.time === 'string' && typeof v.text === 'string').slice(-100);
    lib.count = Number.isInteger(lib.count) && lib.count >= 1 && lib.count <= 50 ? lib.count : 5;
    lib.delaySeconds = normalizedDelaySeconds(lib); delete lib.delay;
    lib.random = normalizeRandom(lib.random, mode);
    lib.recent = Number.isInteger(lib.recent) && lib.recent >= 1 && lib.recent <= 50 ? lib.recent : 3;
    if (!['zip', 'individual', 'none'].includes(lib.delivery)) lib.delivery = 'zip';
    if (!(mode === 'music' ? ['mp3', 'mp4'] : ['original', 'preview']).includes(lib.format)) lib.format = mode === 'music' ? 'mp3' : 'original';
    return lib;
  }
  let data, storageError = '', migrated = false;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      data = JSON.parse(saved);
      if (data.schema !== 2 || !data.libraries) throw new Error('提示词库版本不正确。');
      for (const mode of MODES) normalizeLibrary(data.libraries[mode], mode);
      if (!MODES.includes(data.mode)) data.mode = 'music';
      if (!['dark', 'light'].includes(data.theme)) data.theme = 'dark';
    } else {
      data = defaults();
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        const previous = JSON.parse(old); validateVersions(previous.versions);
        Object.assign(data.libraries.music, { versions: previous.versions, selected: previous.selected, count: previous.count, delaySeconds: Number(previous.delay) * 60, history: previous.history || [] });
        normalizeLibrary(data.libraries.music, 'music'); migrated = true;
      }
    }
  } catch (error) { data = defaults(); storageError = '存储读取失败，原数据未覆盖。请先备份站点数据：' + error.message; }
  const current = () => data.libraries[data.mode];
  const version = () => current().versions.find(v => v.id === current().selected);
  function persist() {
    if (storageError) { status(storageError); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
    catch (error) { status('保存失败，请导出提示词库备份：' + error.message); return false; }
  }

  // Keep styles scoped to the panel. No innerHTML: Gemini enforces Trusted Types.
  const style = document.createElement('style');
  style.textContent = `
  #lyria-batch-panel{--bg:#181b22;--card:#222630;--input:#171a21;--text:#f1f3f8;--muted:#a9b2c4;--border:#394253;--accent:#92afff;--accent-bg:#293f74;--danger:#ffb7b0;--shadow:0 16px 55px #0005;position:fixed;right:20px;bottom:20px;z-index:2147483646;width:390px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);font:13px/1.5 Arial,"Microsoft YaHei",sans-serif;text-align:left;color-scheme:dark}
  #lyria-batch-panel[data-theme=light]{--bg:#fff;--card:#f5f7fb;--input:#fff;--text:#111827;--muted:#596579;--border:#d8deea;--accent:#214fb4;--accent-bg:#e7efff;--danger:#ad2921;--shadow:0 16px 55px #1d315522;color-scheme:light}
  #lyria-batch-panel *{box-sizing:border-box}#lyria-batch-panel [hidden]{display:none!important}
  #lyria-batch-panel .gb-header{display:flex;align-items:center;gap:8px;padding:16px 18px 12px}
  #lyria-batch-panel .gb-brand{flex:1;font-size:16px;font-weight:700}#lyria-batch-panel .gb-brand small{display:block;font:11px Arial;color:var(--muted);margin-top:3px}
  #lyria-batch-panel button,#lyria-batch-panel input,#lyria-batch-panel select,#lyria-batch-panel textarea{font:inherit;color:var(--text)}
  #lyria-batch-panel button{border:1px solid var(--border);border-radius:9px;background:var(--card);padding:7px 10px;cursor:pointer;white-space:nowrap}
  #lyria-batch-panel button:hover:not(:disabled){border-color:var(--accent)}#lyria-batch-panel :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #lyria-batch-panel button:disabled{opacity:.45;cursor:default}#lyria-batch-panel .gb-primary{background:var(--accent-bg);color:var(--accent);border-color:var(--accent);font-weight:700}
  #lyria-batch-panel .gb-danger{color:var(--danger)}#lyria-batch-panel .gb-body{padding:0 14px 12px;overflow:auto;min-height:0}
  #lyria-batch-panel .gb-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;background:var(--card);padding:5px;border-radius:12px;margin-bottom:12px}
  #lyria-batch-panel .gb-tabs button{border-color:transparent;background:transparent}#lyria-batch-panel .gb-tabs button[aria-selected=true]{background:var(--accent-bg);color:var(--accent);font-weight:700}
  #lyria-batch-panel .gb-card{padding:12px;background:var(--card);border:1px solid var(--border);border-radius:12px;margin-top:10px}
  #lyria-batch-panel .gb-heading{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px;font-weight:700}
  #lyria-batch-panel .gb-muted{color:var(--muted);font-size:11px}#lyria-batch-panel .gb-row{display:flex;align-items:center;gap:7px;margin-top:8px}
  #lyria-batch-panel input,#lyria-batch-panel select,#lyria-batch-panel textarea{background:var(--input);border:1px solid var(--border);border-radius:8px;padding:8px;width:100%;min-width:0}
  #lyria-batch-panel textarea{height:155px;resize:vertical;font-size:12px;line-height:1.6}#lyria-batch-panel label{display:block;color:var(--muted);font-size:11px;margin-bottom:4px}
  #lyria-batch-panel input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);margin:0;padding:0}
  #lyria-batch-panel .gb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#lyria-batch-panel .gb-wide{grid-column:1/-1}
  #lyria-batch-panel details{margin-top:10px}#lyria-batch-panel summary{cursor:pointer;color:var(--muted);font-size:12px}
  #lyria-batch-panel .gb-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}#lyria-batch-panel .gb-toolbar button{padding:5px 8px;font-size:11px}
  #lyria-batch-panel .gb-footer{padding:12px 18px 16px;border-top:1px solid var(--border)}#lyria-batch-panel .gb-run{display:grid;grid-template-columns:1fr auto;gap:8px}
  #lyria-batch-panel progress{width:100%;height:5px;accent-color:var(--accent);display:block;margin:0 0 10px}
  #lyria-batch-panel .gb-status{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:9px;font-size:12px;max-height:92px;overflow:auto}
  #lyria-batch-panel .gb-zip-link{display:block;text-align:center;color:var(--accent);background:var(--accent-bg);border:1px solid var(--border);border-radius:9px;padding:7px;margin-bottom:9px;font-weight:700;text-decoration:none}
  #lyria-batch-panel .gb-log{white-space:pre-wrap;overflow:auto;max-height:130px;font-size:11px;color:var(--muted)}#lyria-batch-panel .gb-result a{display:block;color:var(--accent);padding:8px 0;font-weight:700}
  @media(max-width:480px){#lyria-batch-panel{right:12px;bottom:12px;max-height:calc(100vh - 24px)}}`;
  document.head.appendChild(style);
  const make = (parent, tag, text = '', cls = '') => { const el = document.createElement(tag); el.textContent = text; el.className = cls; parent.appendChild(el); return el; };
  const panel = make(document.body, 'section'); panel.id = 'lyria-batch-panel'; panel.setAttribute('aria-label', 'Gemini 批量工作台');
  const header = make(panel, 'div', '', 'gb-header'), brand = make(header, 'div', 'Gemini 批量工作台', 'gb-brand'); make(brand, 'small', 'MUSIC / IMAGE · v0.6');
  const btn = (parent, text, id, cls = '') => { const el = make(parent, 'button', text, cls); el.type = 'button'; el.id = id; return el; };
  const theme = btn(header, '浅色', 'gb-theme'), collapse = btn(header, '收起', 'gb-collapse');
  const body = make(panel, 'div', '', 'gb-body'), tabs = make(body, 'div', '', 'gb-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '生成模式');
  const modeButtons = Object.fromEntries(MODES.map(mode => { const b = btn(tabs, TITLE[mode] + '模式', 'gb-' + mode); b.setAttribute('role', 'tab'); return [mode, b]; }));
  const promptCard = make(body, 'div', '', 'gb-card'), promptHeading = make(promptCard, 'div', '', 'gb-heading');
  const libraryHeading = make(promptHeading, 'span', '提示词库'), savedBadge = make(promptHeading, 'span', '编辑自动保存', 'gb-muted');
  function selectInput(parent, id, labelText) { const l = make(parent, 'label', labelText); l.htmlFor = id; const el = make(parent, 'select'); el.id = id; return el; }
  const select = selectInput(promptCard, 'gb-version', '当前版本');
  const nameRow = make(promptCard, 'div', '', 'gb-row'), name = make(nameRow, 'input'); name.id = 'gb-name'; name.maxLength = 100; name.setAttribute('aria-label', '版本名称');
  const newVersion = btn(nameRow, '另存版本', 'gb-copy'); newVersion.title = '复制当前提示词，保存为独立的新版本';
  const promptLabel = make(promptCard, 'label', '基础提示词 · 随机时仍完整保留原文'); promptLabel.style.marginTop = '10px'; promptLabel.htmlFor = 'gb-prompt';
  const prompt = make(promptCard, 'textarea'); prompt.id = 'gb-prompt';
  const randomRow = make(promptCard, 'div', '', 'gb-row'), randomLabel = make(randomRow, 'label'); randomLabel.style.cssText = 'display:flex;align-items:center;gap:7px;margin:0;flex:1;font-size:12px;color:var(--text)';
  const randomEnabled = make(randomLabel, 'input'); randomEnabled.type = 'checkbox'; randomEnabled.id = 'gb-random'; make(randomLabel, 'span', '启用随机微调');
  const randomDetails = make(promptCard, 'details'); make(randomDetails, 'summary', '随机设置与提示词预览');
  const randomLevel = selectInput(randomDetails, 'gb-random-level', '微调强度');
  const poolLabel = make(randomDetails, 'label', '变化池 · 每行一条，原提示词始终保留'); poolLabel.htmlFor = 'gb-random-pool'; poolLabel.style.marginTop = '8px';
  const randomPoolBox = make(randomDetails, 'textarea'); randomPoolBox.id = 'gb-random-pool'; randomPoolBox.style.height = '100px'; randomPoolBox.maxLength = 20000;
  make(randomDetails, 'div', '每轮随机新增、删除或替换一条末尾微调要求。没有外部 API 调用。', 'gb-muted');
  const previewButton = btn(randomDetails, '预览随机提示词', 'gb-random-preview'); previewButton.style.marginTop = '8px';
  const previewText = make(randomDetails, 'div', '', 'gb-log'); previewText.id = 'gb-prompt-preview'; previewText.style.marginTop = '8px';
  const manage = make(promptCard, 'details'); make(manage, 'summary', '管理版本与备份');
  const manageRow = make(manage, 'div', '', 'gb-toolbar'), remove = btn(manageRow, '移入回收站', 'gb-remove'), undo = btn(manageRow, '恢复最近删除', 'gb-undo'), exportButton = btn(manageRow, '导出当前库', 'gb-export'), importButton = btn(manageRow, '导入版本', 'gb-import');
  const importFile = make(manage, 'input'); importFile.type = 'file'; importFile.accept = '.json,application/json'; importFile.hidden = true;
  const settings = make(body, 'div', '', 'gb-card'); make(settings, 'div', '批次设置', 'gb-heading'); const grid = make(settings, 'div', '', 'gb-grid');
  function num(id, text, min, max) { const wrap = make(grid, 'div'), l = make(wrap, 'label', text); l.htmlFor = id; const n = make(wrap, 'input'); n.id = id; n.type = 'number'; n.min = min; n.max = max; return n; }
  const count = num('gb-count', '生成次数', 1, 50), delay = num('gb-delay', '完成后间隔（秒）', 0, 7200); delay.step = '1';
  const deliveryWrap = make(grid, 'div'), delivery = selectInput(deliveryWrap, 'gb-delivery', '下载方式');
  const formatWrap = make(grid, 'div'), format = selectInput(formatWrap, 'gb-format', '文件格式 / 质量');
  function options(el, entries, value) { el.replaceChildren(); for (const [val, text] of entries) { const o = make(el, 'option', text); o.value = val; } el.value = value; }
  options(delivery, [['zip', '完成后统一 ZIP'], ['individual', '逐个原生下载'], ['none', '仅生成，不下载']], 'zip');
  const hint = make(settings, 'div', '', 'gb-muted'); hint.style.marginTop = '9px';
  const result = make(body, 'div', '', 'gb-card gb-result'); result.hidden = true;
  make(result, 'div', '本轮文件', 'gb-heading'); const fileSummary = make(result, 'div', '', 'gb-muted');
  const zipLink = make(result, 'a'); zipLink.hidden = true; zipLink.id = 'gb-zip-link';
  const resultActions = make(result, 'div', '', 'gb-toolbar'), retry = btn(resultActions, '重试未收集文件', 'gb-retry'), pack = btn(resultActions, '打包已收集文件', 'gb-pack');
  const extras = make(body, 'details'); make(extras, 'summary', '已有作品与运行记录');
  const recoveryRow = make(extras, 'div', '', 'gb-row'), recent = make(recoveryRow, 'input'); recent.type = 'number'; recent.min = 1; recent.max = 50; recent.id = 'gb-recent'; recent.setAttribute('aria-label', '最近作品数量'); recent.style.width = '65px';
  const recover = btn(recoveryRow, '收集最近作品', 'gb-recover'); make(extras, 'div', '仅收集已加载的当前模式作品，不重新生成。', 'gb-muted');
  const exportPrompts = btn(extras, '导出本轮提示词记录', 'gb-export-round-prompts'); exportPrompts.style.marginTop = '8px';
  const log = make(extras, 'div', '', 'gb-log');
  const footer = make(panel, 'div', '', 'gb-footer'), progress = make(footer, 'progress'); progress.max = 1; progress.value = 0;
  const runRow = make(footer, 'div', '', 'gb-run'), start = btn(runRow, '开始音乐批次', 'gb-start', 'gb-primary'), stop = btn(runRow, '停止', 'gb-stop', 'gb-danger'); stop.disabled = true;
  zipLink.className = 'gb-zip-link'; footer.insertBefore(zipLink, runRow);
  const statusLine = make(footer, 'div', '', 'gb-status'); statusLine.id = 'gb-status'; statusLine.setAttribute('role', 'status'); statusLine.setAttribute('aria-live', 'polite');
  let active = null;
  const caches = { music: null, image: null };
  function status(text) { statusLine.textContent = text; }
  function history(text, mode = data.mode) { const lib = data.libraries[mode]; lib.history.push({ time: new Date().toLocaleTimeString(), text }); lib.history = lib.history.slice(-100); persist(); renderLog(); }
  function renderLog() { log.textContent = current().history.slice(-12).map(v => `${v.time} ${v.text}`).join('\n'); }
  function showResult() {
    const cache = caches[data.mode]; result.hidden = !cache; zipLink.hidden = !cache?.zipUrl;
    exportPrompts.disabled = !cache?.prompts.length;
    if (!cache) return;
    fileSummary.textContent = `已收集 ${cache.files.length} 个文件 · ${(cache.bytes / 1048576).toFixed(1)} MB · 待处理 ${cache.pending.length} 项`;
    retry.disabled = !!active || !cache.pending.length; pack.disabled = !!active || !cache.files.length;
    zipLink.hidden = !cache.zipUrl;
    if (cache.zipUrl) { zipLink.href = cache.zipUrl; zipLink.download = cache.zipName; zipLink.title = cache.zipName; zipLink.textContent = '下载 ZIP · ' + cache.files.length + ' 个文件'; }
  }
  function render() {
    panel.dataset.theme = data.theme; theme.textContent = data.theme === 'dark' ? '浅色' : '深色'; theme.setAttribute('aria-label', data.theme === 'dark' ? '切换浅色主题' : '切换深色主题');
    for (const mode of MODES) modeButtons[mode].setAttribute('aria-selected', String(data.mode === mode));
    libraryHeading.textContent = TITLE[data.mode] + '提示词库';
    options(select, current().versions.map(v => [v.id, v.name]), current().selected); name.value = version().name; prompt.value = version().prompt;
    count.value = current().count; delay.value = current().delaySeconds; recent.value = current().recent; delivery.value = current().delivery;
    randomEnabled.checked = current().random.enabled; randomPoolBox.value = current().random.pool;
    options(randomLevel, [['1', '轻微 · 最多 1 条要求'], ['2', '适中 · 最多 2 条要求']], String(current().random.strength)); previewText.textContent = '';
    options(format, data.mode === 'music' ? [['mp3', 'MP3 · 纯音频'], ['mp4', 'MP4 · 音频与封面']] : [['original', '原图 · 官方下载'], ['preview', '预览图 · 页面尺寸']], current().format);
    hint.textContent = data.mode === 'music' ? '使用页面当前音乐设置。ZIP 内包含媒体、提示词及批次清单。' : '请先在 Gemini 选中图片工具。次数指请求数，一次生成多张会全部收集。';
    start.textContent = '开始' + TITLE[data.mode] + '批次'; undo.disabled = !!active || !current().trash.length;
    showResult(); renderLog();
  }
  theme.onclick = () => { data.theme = data.theme === 'dark' ? 'light' : 'dark'; persist(); panel.dataset.theme = data.theme; theme.textContent = data.theme === 'dark' ? '浅色' : '深色'; theme.setAttribute('aria-label', data.theme === 'dark' ? '切换浅色主题' : '切换深色主题'); };
  collapse.onclick = () => { body.hidden = !body.hidden; collapse.textContent = body.hidden ? '展开' : '收起'; };
  for (const mode of MODES) modeButtons[mode].onclick = () => { if (active) return; data.mode = mode; persist(); render(); progress.value = 0; status('已切换到' + TITLE[mode] + '模式，提示词库与参数独立保存。'); };
  prompt.oninput = () => { version().prompt = prompt.value; savedBadge.textContent = persist() ? '编辑已保存' : '保存失败'; };
  name.oninput = () => { if (name.value.trim()) { version().name = name.value.trim(); select.selectedOptions[0].textContent = version().name; persist(); } };
  select.onchange = () => { current().selected = select.value; persist(); render(); status('已切换提示词：' + version().name); };
  newVersion.onclick = () => {
    if (current().versions.length >= 200) return status('最多 200 个版本。');
    const base = version().name.slice(0, 78) + ' · 新版本'; let title = base, serial = 2;
    while (current().versions.some(v => v.name === title)) title = base + ' ' + serial++;
    const v = { id: uid(), name: title, prompt: prompt.value }; current().versions.push(v); current().selected = v.id; persist(); render(); name.focus(); name.select();
  };
  remove.onclick = () => { if (current().versions.length === 1) return status('至少保留一个版本。'); current().trash.push(version()); current().trash = current().trash.slice(-20); current().versions = current().versions.filter(v => v.id !== current().selected); current().selected = current().versions[0].id; persist(); render(); status('已移入回收站，可恢复最近删除的版本。'); };
  undo.onclick = () => { if (!current().trash.length || current().versions.length >= 200) return; const v = current().trash.pop(); v.id = uid(); current().versions.push(v); current().selected = v.id; persist(); render(); };
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), a = make(panel, 'a'); a.href = url; a.download = filename; a.hidden = true; a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  exportButton.onclick = () => downloadBlob(new Blob([JSON.stringify({ schema: 2, mode: data.mode, versions: current().versions }, null, 2)], { type: 'application/json' }), 'gemini-' + data.mode + '-prompts.json');
  importButton.onclick = () => importFile.click();
  importFile.onchange = async () => {
    const destination = data.mode;
    try {
      const file = importFile.files[0]; if (!file) return; if (file.size > 5 * 1048576) throw new Error('文件超过 5 MB。');
      const incoming = JSON.parse(await file.text()); validateVersions(incoming.versions);
      if (incoming.schema !== 1 && incoming.schema !== 2) throw new Error('不支持的备份格式。');
      if (incoming.schema === 1 && destination !== 'music') throw new Error('旧版备份属于音乐库，请切换到音乐模式后导入。');
      if (incoming.schema === 2 && incoming.mode !== destination) throw new Error('请先切换到备份对应的' + TITLE[incoming.mode] + '模式。');
      const lib = data.libraries[destination]; if (lib.versions.length + incoming.versions.length > 200) throw new Error('导入后超过 200 个版本。');
      for (const v of incoming.versions) lib.versions.push({ ...v, id: uid() });
      lib.selected = lib.versions.at(-incoming.versions.length).id; persist(); render(); status('已追加导入版本。');
    } catch (error) { status('导入失败：' + error.message); } finally { importFile.value = ''; }
  };
  for (const input of [count, delay, recent, delivery, format]) input.addEventListener('input', () => { Object.assign(current(), { count: Number(count.value), delaySeconds: Number(delay.value), recent: Number(recent.value), delivery: delivery.value, format: format.value }); persist(); });
  for (const input of [randomEnabled, randomLevel, randomPoolBox]) input.addEventListener('input', () => {
    current().random = { enabled: randomEnabled.checked, strength: Number(randomLevel.value), pool: randomPoolBox.value }; persist(); previewText.textContent = '';
  });
  previewButton.onclick = () => {
    try { const example = variedPrompt(prompt.value, normalizeRandom(current().random, data.mode), {}); previewText.textContent = example.text; }
    catch (error) { status(error.message); }
  };
  exportPrompts.onclick = () => {
    const cache = caches[data.mode]; if (!cache?.prompts.length) return;
    downloadBlob(new Blob([JSON.stringify({ mode: cache.mode, basePrompt: cache.text, random: cache.random, rounds: cache.prompts }, null, 2)], { type: 'application/json' }), 'gemini-' + cache.mode + '-round-prompts.json');
  };

  // ZIP STORE: already-compressed media gains little from a second compression.
  const utf8 = text => new TextEncoder().encode(text);
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function zipStore(files) {
    const parts = [], central = []; let offset = 0, centralBytes = 0;
    const now = new Date(), day = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    for (const file of files) {
      const name = utf8(file.name), bytes = file.bytes, crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(10, time, true); view.setUint16(12, day, true); view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, name.length, true); local.set(name, 30);
      const entry = new Uint8Array(46 + name.length), cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(12, time, true); cv.setUint16(14, day, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); entry.set(name, 46);
      parts.push(local, bytes); central.push(entry); offset += local.length + bytes.length; centralBytes += entry.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralBytes, true); ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  function newCache(mode, text, fmt, requested) {
    const old = caches[mode]; if (old?.zipUrl) URL.revokeObjectURL(old.zipUrl);
    const cache = { mode, text, format: fmt, requested, created: new Date().toISOString(), page: location.origin + location.pathname, files: [], pending: [], bytes: 0, generated: 0, zipUrl: '', zipName: '', operation: 'generate', random: defaultRandom(mode), intervalSeconds: 0, prompts: [], randomState: {} };
    caches[mode] = cache; return cache;
  }
  function invalidateZip(cache) { if (cache.zipUrl) URL.revokeObjectURL(cache.zipUrl); cache.zipUrl = ''; }
  function packageCache(cache, automatic = false) {
    if (!cache.files.length) throw new Error('还没有收集到可打包文件。');
    const manifest = { mode: cache.mode, format: cache.format, created: cache.created, requested: cache.requested, generated: cache.generated, complete: cache.pending.length === 0 && cache.generated >= cache.requested, sourcePage: cache.page, operation: cache.operation, intervalSeconds: cache.intervalSeconds, random: { enabled: cache.random.enabled, strength: cache.random.strength, strategy: 'local-suffix' }, rounds: cache.prompts.map(({ round, state, responseId, operation, tweaks }) => ({ round, state, responseId, operation, tweaks })), files: cache.files.map(({ name, responseId, size }) => ({ name, responseId, size })), pending: cache.pending.map(({ responseId, index, error }) => ({ responseId, index, error })) };
    const files = cache.files.map(({ name, bytes }) => ({ name, bytes })); files.push({ name: 'prompt.txt', bytes: utf8(cache.text) }, { name: 'manifest.json', bytes: utf8(JSON.stringify(manifest, null, 2)) });
    if (cache.prompts.length) {
      files.push({ name: 'prompts.json', bytes: utf8(JSON.stringify(cache.prompts, null, 2)) });
      for (const entry of cache.prompts) files.push({ name: 'prompts/' + String(entry.round).padStart(3, '0') + '.txt', bytes: utf8(entry.text) });
    }
    invalidateZip(cache); cache.zipUrl = URL.createObjectURL(zipStore(files)); cache.zipName = 'gemini-' + cache.mode + '-' + cache.created.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '') + (manifest.complete ? '' : '-partial') + '.zip';
    showResult(); if (automatic) zipLink.click();
    history('ZIP 已打包：' + cache.files.length + ' 个媒体文件', cache.mode);
    status(`ZIP 已准备：${cache.files.length} 个文件${manifest.complete ? '' : '（部分结果）'}。${automatic ? '\n已发起下载；若浏览器拦截，点击“下载 ZIP”重试。' : '\n点击“下载 ZIP”保存。'}`);
  }

  // Discover only generated outputs inside model replies; never include uploads/avatars/music cover images.
  const RESP = '[id^="model-response-message-content"]';
  const MUSIC_DOWNLOAD = 'button[aria-label="下载音乐作品"],button[aria-label="Download music creation"],button[aria-label="Download music"]';
  const imageNodes = root => $all('generated-image single-image img, generated-image img, single-image.generated-image img', root).filter(i => !i.closest('generated-music') && i.complete && i.naturalWidth > 0);
  const imageButton = root => $all('button[aria-label],button[title]', root).find(b => /下载完整尺寸的图片|下载原图|Download full size|Download image/i.test(b.getAttribute('aria-label') || b.title));
  const editor = () => $all('[contenteditable="true"][role="textbox"]').find(visible);
  const replies = () => $all(RESP);
  const busyPage = () => $all('button[aria-label]').some(b => !panel.contains(b) && visible(b) && /^(停止回答|停止生成|Stop response|Stop generating)$/i.test(b.getAttribute('aria-label')));
  function assertActive(ctx) {
    if (ctx.signal.aborted) throw abortError();
    if (location.pathname !== ctx.path) {
      if (ctx.newConversationAllowed && /^\/app\/[\w-]+$/.test(location.pathname)) {
        ctx.path = location.pathname; ctx.newConversationAllowed = false; ctx.cache.page = location.origin + location.pathname;
      } else throw new Error('对话已切换；已收集文件仍可打包。');
    }
  }
  function sleep(ms, ctx) {
    assertActive(ctx);
    return new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(abortError()); };
      const timer = setTimeout(() => { ctx.signal.removeEventListener('abort', cancel); resolve(); }, ms);
      ctx.signal.addEventListener('abort', cancel, { once: true });
    });
  }
  async function until(find, timeout, ctx, message) { const end = Date.now() + timeout; while (Date.now() < end) { assertActive(ctx); const v = find(); if (v) return v; await sleep(300, ctx); } throw new Error(message); }
  function checkReady(mode) {
    const selectedTool = $all('button[aria-label]').map(b => b.getAttribute('aria-label')).find(s => /取消选择|Deselect/i.test(s) && /音乐|music|图片|image/i.test(s));
    if (!selectedTool || !(mode === 'music' ? /音乐|music/i : /图片|image/i).test(selectedTool)) throw new Error('请先在 Gemini 选中' + TITLE[mode] + '工具，并与脚本模式保持一致。');
    if (!editor()) throw new Error('找不到 Gemini 提示词输入框。');
    if (busyPage()) throw new Error('Gemini 仍在生成，请等当前请求结束。');
  }
  async function send(text, ctx) {
    assertActive(ctx); const input = editor(); if (!input || input.textContent.trim()) throw new Error('页面输入框已有文字，请先处理未发送内容。');
    input.focus(); if (!document.execCommand('insertText', false, text)) throw new Error('无法填入提示词。');
    const norm = s => s.replace(/\s+/g, ' ').trim(); if (norm(input.innerText) !== norm(text)) throw new Error('提示词未完整填入，请检查页面输入框。');
    const submit = await until(() => $all('button[aria-label]').find(b => visible(b) && !b.disabled && /^(发送|发送消息|Send|Send message)$/i.test(b.getAttribute('aria-label'))), 10000, ctx, '发送按钮不可用。');
    assertActive(ctx); ctx.newConversationAllowed = /^\/app\/?$/.test(ctx.path); submit.click(); await until(() => !input.isConnected || !input.textContent.trim(), 10000, ctx, '无法确认提交；停止以避免重复发送。');
  }
  async function waitReply(before, ctx) {
    let stableId = '', signature = '', stableSince = 0;
    return until(() => {
      const fresh = replies().filter(r => !before.has(r.id)); if (fresh.length > 1) throw new Error('出现多个新回复，请停止手动发送消息。');
      const r = fresh[0]; if (!r) return null;
      if (/未能成功生成音频|无法生成.{0,15}(音乐|音频|图片)|已达到.{0,30}(上限|限额)|达到.{0,30}限额|couldn.t generate|failed to generate|rate limit|reached.{0,30}limit|try again later/i.test(r.textContent)) throw new Error('Gemini 本次生成失败或额度受限，请查看回复。');
      const images = ctx.mode === 'image' ? imageNodes(r) : [];
      const ready = ctx.mode === 'music' ? !!r.querySelector(MUSIC_DOWNLOAD) : images.length > 0;
      if (!ready || busyPage()) { stableSince = 0; return null; }
      const sig = ctx.mode === 'music' ? r.id : images.map(i => i.currentSrc || i.src).join('|');
      if (stableId !== r.id || signature !== sig || !stableSince) { stableId = r.id; signature = sig; stableSince = Date.now(); }
      return Date.now() - stableSince >= 2500 ? r.id : null;
    }, 12 * 60000, ctx, '12 分钟内未检测到完整作品。请检查 Gemini，不要直接重复提交。');
  }
  const downloadItems = () => $all('[role="menuitem"]').filter(b => visible(b) && !b.disabled && /纯音频|Audio only|MP3|音频和封面|视频|Video/i.test(b.textContent));
  async function triggerDownload(responseId, index, ctx) {
    const r = document.getElementById(responseId); if (!r) throw new Error('作品未加载在页面中，请滚动到对应作品后重试。');
    r.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (ctx.mode === 'image') {
      const image = imageNodes(r)[index]; if (!image) throw new Error('找不到该张生成图片。');
      const host = image.closest('single-image') || image.closest('generated-image'), b = imageButton(host);
      if (!b || b.disabled) throw new Error('找不到该图片的官方原图下载按钮。'); assertActive(ctx); b.click(); return;
    }
    if (downloadItems().length) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await until(() => !downloadItems().length, 3000, ctx, '请先关闭已有下载菜单。'); }
    const b = r.querySelector(MUSIC_DOWNLOAD); if (!b || b.disabled) throw new Error('音乐下载按钮不可用。'); assertActive(ctx); b.click();
    const desired = ctx.cache.format === 'mp4' ? /音频和封面|视频|Video/i : /纯音频|Audio only|MP3/i;
    const item = await until(() => { const list = downloadItems().filter(b => desired.test(b.textContent)); if (list.length > 1) throw new Error('多个下载菜单同时出现。'); return list[0]; }, 10000, ctx, '未找到所选格式的下载菜单。');
    assertActive(ctx); item.click();
  }
  function permitted(url) {
    try { const u = new URL(url, location.href); return u.protocol === 'blob:' ? u.origin === location.origin : u.protocol === 'data:' ? /^data:(image\/|audio\/|video\/|application\/octet-stream)/i.test(url) : u.protocol === 'https:' && (u.origin === location.origin || /(^|\.)(googleusercontent\.com|usercontent\.google\.com)$/.test(u.hostname)) || u.origin === location.origin && /^https?:$/.test(u.protocol); } catch { return false; }
  }
  async function fetchBytes(url, ctx) {
    assertActive(ctx); if (!permitted(url)) throw new Error('下载地址不属于当前页面或受支持的 Google 媒体域名。');
    const u = new URL(url, location.href);
    if (u.protocol === 'blob:' || u.protocol === 'data:' || u.origin === location.origin) {
      const response = await fetch(url, { signal: ctx.signal, credentials: 'same-origin' }); if (!response.ok) throw new Error('文件读取失败：HTTP ' + response.status);
      const bytes = new Uint8Array(await response.arrayBuffer()); assertActive(ctx); return bytes;
    }
    if (typeof GM_xmlhttpRequest !== 'function') throw new Error('ZIP 需要 Tampermonkey 的 GM_xmlhttpRequest 权限，请完整更新脚本头部。');
    return new Promise((resolve, reject) => {
      let request, timer, done = false;
      const finish = (error, bytes) => { if (done) return; done = true; clearTimeout(timer); ctx.signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(bytes); };
      const cancel = () => { finish(abortError()); request?.abort(); };
      ctx.signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { finish(new Error('文件读取超时。')); request?.abort(); }, 120000);
      try { request = GM_xmlhttpRequest({ method: 'GET', url, responseType: 'arraybuffer', timeout: 120000,
        onload: r => { if (r.status < 200 || r.status >= 300 || (r.finalUrl && !permitted(r.finalUrl))) return finish(new Error('文件读取失败或登录失效：HTTP ' + r.status)); finish(null, new Uint8Array(r.response)); },
        onprogress: e => { if (e.loaded > LIMIT || e.total > LIMIT) { finish(new Error('文件超过 512 MB。')); request?.abort(); } },
        onerror: () => finish(new Error('下载文件失败，请检查 Tampermonkey 媒体域名权限或网络。')), ontimeout: () => finish(new Error('文件读取超时。')), onabort: () => finish(abortError()) });
      } catch (error) { finish(error); }
    });
  }
  // Capture only an expected official download, for at most one file at a time.
  // Restore the page methods in finally, including on abort/error. No private API calls.
  async function captureOfficial(responseId, index, ctx) {
    const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const proto = page.HTMLAnchorElement.prototype, original = proto.click;
    let taken = false, pendingRead = null;
    const matches = a => {
      if (taken || !a?.href || !permitted(a.href) || panel.contains(a)) return false;
      const name = a.download || '', source = a.href;
      if (ctx.mode === 'music') return [name, source].some(v => /\.mp3(?:$|[?&#])/i.test(v)) || (!!a.download && /^(blob:|data:audio)/i.test(source));
      return [name, source].some(v => /\.(png|jpe?g|webp|gif|avif)(?:$|[?&#])/i.test(v)) || (!!a.download && /^(blob:|data:image)/i.test(source));
    };
    const take = a => { if (!matches(a)) return false; taken = true; pendingRead = fetchBytes(a.href, ctx).then(bytes => ({ bytes }), error => ({ error })); return true; };
    function wrapped(...args) { if (take(this)) return; return original.apply(this, args); }
    const click = e => { const a = e.target?.closest?.('a'); if (a && take(a)) { e.preventDefault(); e.stopImmediatePropagation(); } };
    try {
      proto.click = wrapped;
      if (proto.click !== wrapped) throw new Error('无法接入页面下载事件，可改用 MP4/预览图或逐个原生下载。');
      document.addEventListener('click', click, true);
      await triggerDownload(responseId, index, ctx);
      await until(() => pendingRead, 60000, ctx, '没有捕获到官方文件下载。可选择 MP4/预览图，或改用逐个原生下载。');
      const answer = await pendingRead; if (answer.error) throw answer.error; assertActive(ctx); return answer.bytes;
    } finally { document.removeEventListener('click', click, true); if (proto.click === wrapped) proto.click = original; }
  }
  function detectFormat(bytes) {
    const b = bytes, ascii = (offset, length) => String.fromCharCode(...b.slice(offset, offset + length));
    if (b.length >= 8 && b[0] === 137 && ascii(1, 3) === 'PNG' && b[4] === 13 && b[5] === 10) return 'png';
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
    if (/^GIF8[79]a$/.test(ascii(0, 6))) return 'gif';
    if (ascii(4, 4) === 'ftyp') return /avif|avis/.test(ascii(8, 4)) ? 'avif' : 'mp4';
    if (ascii(0, 3) === 'ID3' || (b[0] === 255 && (b[1] & 0xe0) === 0xe0 && (b[1] & 6) === 2)) return 'mp3';
    return null;
  }
  async function collect(item, ctx, cache) {
    assertActive(ctx); const r = document.getElementById(item.responseId); if (!r) throw new Error('作品不在当前已加载页面。');
    let bytes;
    if (ctx.mode === 'music' && cache.format === 'mp4') { const media = r.querySelector('generated-music video,generated-music audio,video-player video'); const url = media?.currentSrc || media?.src; if (!url) throw new Error('该作品没有可读取的音视频地址。'); bytes = await fetchBytes(url, ctx); }
    else if (ctx.mode === 'image' && cache.format === 'preview') { const image = imageNodes(r)[item.index]; if (!image) throw new Error('预览图尚未加载。'); bytes = await fetchBytes(image.currentSrc || image.src, ctx); }
    else bytes = await captureOfficial(item.responseId, item.index, ctx);
    const ext = detectFormat(bytes), expected = ctx.mode === 'music' ? cache.format : null;
    if (!ext || (expected ? ext !== expected : !['png', 'jpg', 'webp', 'gif', 'avif'].includes(ext))) throw new Error('文件内容与选定格式不符，未加入 ZIP；不会把 MP4 改名为 MP3。');
    const total = MODES.reduce((n, mode) => n + (caches[mode]?.bytes || 0), 0); if (total + bytes.length > LIMIT) throw new Error('两个模式的缓存合计超过 512 MB，请保存 ZIP 后刷新页面。');
    invalidateZip(cache); cache.bytes += bytes.length;
    cache.files.push({ name: `${String(item.order).padStart(3, '0')}_${ctx.mode}_${item.index + 1}.${ext}`, bytes, size: bytes.length, responseId: item.responseId });
    history('已收集文件：' + cache.files.at(-1).name, ctx.mode); showResult();
  }
  function descriptors(id, mode, order) { const r = document.getElementById(id); const n = mode === 'image' ? imageNodes(r).length : 1; return Array.from({ length: n }, (_, index) => ({ responseId: id, index, order, error: '' })); }
  const locked = [select, name, prompt, newVersion, remove, undo, importButton, count, delay, delivery, format, recent, randomEnabled, randomLevel, randomPoolBox, previewButton, ...Object.values(modeButtons)];
  function lock(value) { for (const el of locked) el.disabled = value; start.disabled = value; stop.disabled = !value; recover.disabled = value; showResult(); if (!value) undo.disabled = !current().trash.length; }
  async function task(work, cache) {
    if (active) return;
    const controller = new AbortController(), ctx = { mode: data.mode, path: location.pathname, signal: controller.signal, controller, cache };
    active = ctx; lock(true);
    try { await work(ctx); }
    catch (error) { history(error.name === 'AbortError' ? '任务已停止' : error.message, ctx.mode); status((error.name === 'AbortError' ? '已停止。Gemini 已收到的请求可能继续完成。' : '任务停止：' + error.message) + (cache?.files.length ? '\n已收集文件仍可打包保存。' : '')); }
    finally { if (active === ctx) { active = null; lock(false); } }
  }
  async function collectPending(ctx, cache) {
    const pending = [...cache.pending];
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]; status(`收集文件 ${i + 1}/${pending.length}…`);
      try { await collect(item, ctx, cache); cache.pending = cache.pending.filter(v => v !== item); }
      catch (error) { item.error = error.message; throw error; }
      showResult();
    }
  }
  start.onclick = () => {
    if (active) return;
    const lib = current(), total = Number(count.value), seconds = Number(delay.value), text = prompt.value;
    if (!Number.isInteger(total) || total < 1 || total > 50 || !Number.isInteger(seconds) || seconds < 0 || seconds > 7200) return status('生成次数 1–50，间隔填写 0–7200 的整数秒。');
    if (!text.trim()) return status('请输入提示词。');
    const randomConfig = normalizeRandom(lib.random, data.mode);
    try { validateRandom(randomConfig); checkReady(data.mode); } catch (error) { return status(error.message); }
    if (caches[data.mode]?.files.length && !confirm('开始新批次会替换当前模式的文件缓存。已保存 ZIP 后再继续。是否开始？')) return;
    version().prompt = text; persist();
    const cache = newCache(data.mode, text, lib.format, total), downloadMode = lib.delivery; progress.max = total; progress.value = 0;
    cache.random = randomConfig; cache.intervalSeconds = seconds;
    task(async ctx => {
      for (let i = 1; i <= total; i++) {
        assertActive(ctx); checkReady(ctx.mode); const before = new Set(replies().map(r => r.id));
        const variation = variedPrompt(text, cache.random, cache.randomState), entry = { round: i, text: variation.text, operation: variation.operation, tweaks: variation.tweaks, state: 'prepared' }; cache.prompts.push(entry); showResult();
        status(`第 ${i}/${total} 次：发送${cache.random.enabled ? '随机微调' : ''}提示词…`); await send(entry.text, ctx); entry.state = 'submitted'; entry.submittedAt = new Date().toISOString();
        if (cache.random.enabled) history(`第 ${i} 次微调：${({ add: '新增', remove: '删除', replace: '替换' })[entry.operation]}一条要求；当前 ${entry.tweaks.length} 条。`, ctx.mode);
        status(`第 ${i}/${total} 次：等待${TITLE[ctx.mode]}生成…`); const id = await waitReply(before, ctx); ctx.newConversationAllowed = false; cache.generated++; entry.state = 'generated'; entry.responseId = id; progress.value = i; history('生成完成：' + id, ctx.mode);
        const items = descriptors(id, ctx.mode, i);
        if (downloadMode === 'zip') { cache.pending.push(...items); await collectPending(ctx, cache); }
        else if (downloadMode === 'individual') { for (const item of items) {
          if (ctx.mode === 'image' && cache.format === 'preview') { await collect(item, ctx, cache); const file = cache.files.at(-1); downloadBlob(new Blob([file.bytes]), file.name); }
          else await triggerDownload(id, item.index, ctx);
          await sleep(5000, ctx);
        } }
        if (i < total) { const end = Date.now() + seconds * 1000; while (Date.now() < end) { status(`完成 ${i}/${total} 次；${Math.ceil((end - Date.now()) / 1000)} 秒后继续。`); await sleep(Math.min(1000, Math.max(1, end - Date.now())), ctx); } }
      }
      if (downloadMode === 'zip') packageCache(cache, true);
      else status(`已完成 ${total} 次生成。${downloadMode === 'individual' ? '已发起原生下载，请在 Ctrl+J 中确认。' : ''}`);
    }, cache);
  };
  recover.onclick = () => {
    if (active) return; const n = Number(recent.value); if (!Number.isInteger(n) || n < 1 || n > 50) return status('最近作品数量请填写 1–50。');
    const ids = replies().filter(r => data.mode === 'music' ? !!r.querySelector(MUSIC_DOWNLOAD) : imageNodes(r).length > 0).slice(-n).map(r => r.id);
    if (!ids.length) return status('当前页面没有已加载的' + TITLE[data.mode] + '作品，请先滚动加载。');
    if (caches[data.mode]?.files.length && !confirm('收集已有作品会替换当前模式的文件缓存。是否继续？')) return;
    const cache = newCache(data.mode, prompt.value, current().format, ids.length); cache.operation = 'collect-existing'; cache.generated = ids.length; cache.pending = ids.flatMap((id, i) => descriptors(id, data.mode, i + 1));
    task(async ctx => { await collectPending(ctx, cache); packageCache(cache, true); }, cache);
  };
  retry.onclick = () => { const cache = caches[data.mode]; if (!cache) return; task(async ctx => { await collectPending(ctx, cache); packageCache(cache, true); }, cache); };
  pack.onclick = () => { try { packageCache(caches[data.mode]); } catch (error) { status(error.message); } };
  stop.onclick = () => { if (active) { active.controller.abort(); stop.disabled = true; status('正在停止…'); } };
  render(); status(storageError || (migrated ? '已迁移旧版音乐提示词库；原记录保留。' : '就绪。先选择模式和提示词，再开始批次。')); if (!storageError) persist();
})();
