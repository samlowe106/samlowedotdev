// Wires up the Wonder Mail Generator page (collections/_tools/wondermail.md).
// The actual codec/data lives in ./wondermail/ (a git submodule, see
// https://github.com/samlowe106/wondermail) -- this file is just DOM glue.

import {
  buildMission,
  readMission,
  MISSION_TYPES,
  REWARD_KINDS,
  WonderMailError,
  listDungeons,
  listItems,
  listObjectiveItems,
  listPokemon,
  listFriendAreas,
  getDifficulty,
  getDifficultyLetter
} from './wondermail/src/index.js';
import { ITEM_ICONS } from './wondermail-item-icons.js';
import { POKEMON_ICONS } from './wondermail-pokemon-icons.js';

const itemIconUrl = (name) => (ITEM_ICONS[name] ? `/assets/img/wondermail/items/${ITEM_ICONS[name]}` : null);
const pokemonIconUrl = (name) => (POKEMON_ICONS[name] ? `/assets/img/wondermail/pokemon/${POKEMON_ICONS[name]}` : null);
const rewardIconUrl = (name) => (name.startsWith('Friend Area: ') ? '/assets/img/wondermail/wigglytuff.png' : itemIconUrl(name));

function sortedByName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

// The reward dropdown covers all three reward shapes in one list, since
// they're mutually exclusive choices, not independent fields: "(None)" for
// money-only, every real item, and every Friend Area (Wigglytuff icon,
// grouped at the end rather than interleaved alphabetically with items so
// they still read as one kind of thing). Values are namespaced ("item:55",
// "area:10") since item ids and Friend Area ids both start back at 1.
const REWARD_NONE_VALUE = 'none';
const rewardOptions = [
  { value: REWARD_NONE_VALUE, name: '(None)' },
  ...sortedByName(listItems({ includeNothing: false })).map((item) => ({ value: `item:${item.id}`, name: item.name })),
  ...sortedByName(listFriendAreas().filter((area) => area.id !== 0)).map((area) => ({
    value: `area:${area.id}`,
    name: `Friend Area: ${area.name}`
  }))
];
const pokemonList = listPokemon();

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STAR_ICON_HTML = '<span class="wm-icon wm-icon-star" role="img" aria-label="max difficulty"></span>';
// "*" is the max-difficulty rank (see DIFFICULTY_LETTERS in the library) --
// shown as the game's own star icon everywhere a rank appears, not the
// asterisk character.
//
// Per-letter colors match gMissionRankText in the decomp (src/data/pokemon_mail.h):
// E is COLOR DEFAULT (unstyled), D/C are COLOR GREEN, B/A are COLOR CYAN, S is
// COLOR RED, and the max-difficulty entry is a plain STAR_BULLET with no color
// macro at all.
const RANK_COLOR_CLASS = { D: 'pmd-c-green', C: 'pmd-c-green', B: 'pmd-c-cyan', A: 'pmd-c-cyan', S: 'pmd-c-red' };
function colorizeRank(text) {
  return [...text].map((ch) => {
    if (ch === '*') return STAR_ICON_HTML;
    const cls = RANK_COLOR_CLASS[ch];
    return cls ? `<span class="${cls}">${escapeHtml(ch)}</span>` : escapeHtml(ch);
  }).join('');
}

// Dungeon/floor option labels end in "(E)" or "(B-A)" -- the difficulty
// rank. Recolored to match how the "Rescue Description" box itself shows
// difficulty, rather than reading as plain parenthetical text. No icon to
// the left of these -- unlike items/Pokémon, there's nothing to depict.
const RANK_SUFFIX = /^(.*) \(([^()]+)\)$/;
function formatDungeonOrFloorLabel(name) {
  const match = name.match(RANK_SUFFIX);
  if (!match) return escapeHtml(name);
  const [, base, rank] = match;
  return `${escapeHtml(base)} (${colorizeRank(rank)})`;
}

// A native <select> can't show an icon per option in any browser (Chrome/Safari
// don't style option backgrounds at all; Firefox only styles the open list, never
// the closed control), so a dropdown with per-item icons has to be built by hand.
// This wraps a real <select> -- kept in the DOM, hidden, as the source of truth for
// value/change events so the rest of the app doesn't need to know the difference --
// with a custom button + listbox that mirrors it and shows an icon per option.
// `formatLabel`, if given, renders the option as HTML instead of plain text
// (used for the dungeon/floor rank coloring above).
function makeIconCombo(select, resolveIconUrl, formatLabel) {
  const wrap = document.createElement('div');
  wrap.className = 'wm-combo';
  select.insertAdjacentElement('beforebegin', wrap);
  wrap.appendChild(select);
  select.classList.add('wm-combo-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wm-combo-button form-select';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const buttonIcon = document.createElement('span');
  buttonIcon.className = 'wm-icon';
  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'wm-combo-label';
  button.append(buttonIcon, buttonLabel);
  wrap.appendChild(button);

  const list = document.createElement('ul');
  list.className = 'wm-combo-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);

  function setIcon(iconEl, name) {
    const url = resolveIconUrl(name);
    if (url) {
      iconEl.style.backgroundImage = `url('${url}')`;
      iconEl.hidden = false;
    } else {
      iconEl.style.backgroundImage = '';
      iconEl.hidden = true;
    }
  }

  let items = [];

  function syncButton() {
    const opt = select.options[select.selectedIndex];
    const name = opt ? opt.textContent : '';
    setIcon(buttonIcon, name);
    if (formatLabel) {
      buttonLabel.innerHTML = formatLabel(name);
    } else {
      buttonLabel.textContent = name;
    }
  }

  function markSelected() {
    items.forEach((li, i) => li.setAttribute('aria-selected', i === select.selectedIndex ? 'true' : 'false'));
  }

  function choose(index) {
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncButton();
    markSelected();
    closeList();
    button.focus();
  }

  function buildList() {
    list.innerHTML = '';
    items = Array.from(select.options).map((opt, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      const icon = document.createElement('span');
      icon.className = 'wm-icon';
      setIcon(icon, opt.textContent);
      const label = document.createElement('span');
      if (formatLabel) {
        label.innerHTML = formatLabel(opt.textContent);
      } else {
        label.textContent = opt.textContent;
      }
      li.append(icon, label);
      li.addEventListener('click', () => choose(i));
      list.appendChild(li);
      return li;
    });
    markSelected();
  }

  function onDocClick(e) {
    if (!wrap.contains(e.target)) closeList();
  }

  function openList() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (items[select.selectedIndex] || items[0])?.focus();
    document.addEventListener('click', onDocClick);
  }

  function closeList() {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
  }

  button.addEventListener('click', () => (list.hidden ? openList() : closeList()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  });
  list.addEventListener('keydown', (e) => {
    const current = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[Math.min(items.length - 1, current + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(0, current - 1)]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (current >= 0) choose(current);
    } else if (e.key === 'Escape') {
      closeList();
      button.focus();
    }
  });

  const widget = {
    refresh() {
      buildList();
      syncButton();
    }
  };
  select._comboWidget = widget;
  widget.refresh();
  return widget;
}

// Repopulates a <select>'s options; if it's been combo-ified (makeIconCombo),
// also rebuilds the custom listbox to match.
function fillSelect(select, options, { valueKey = 'id', labelKey = 'name' } = {}) {
  select.innerHTML = '';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option[valueKey];
    node.textContent = option[labelKey];
    select.appendChild(node);
  }
  select._comboWidget?.refresh();
}

// Sets a <select>'s value and, if combo-ified, syncs the widget to match --
// plain `select.value = x` would otherwise leave the custom button showing
// the previous option.
function setSelectValue(select, value) {
  select.value = value;
  select._comboWidget?.refresh();
}

function init(root) {
  const missionTypeSelect = el('wm-type');
  const dungeonSelect = el('wm-dungeon');
  const floorSelect = el('wm-floor');
  const clientSelect = el('wm-client');
  const clientRandomize = el('wm-client-randomize');
  const targetSelect = el('wm-target');
  const targetRandomize = el('wm-target-randomize');
  const itemSelect = el('wm-item');
  const targetField = el('wm-target-field');
  const itemField = el('wm-item-field');
  const rewardItemSelect = el('wm-reward-item');
  const rewardMoneyCheckbox = el('wm-reward-money');
  const rewardMoneyField = el('wm-reward-money-field');
  const variantInput = el('wm-variant');
  const variantShuffle = el('wm-variant-shuffle');
  const variantDown = el('wm-variant-down');
  const variantUp = el('wm-variant-up');
  const mailBox = el('wondermail-mail');
  const decodeInput = el('wm-decode-input');
  const decodeButton = el('wm-decode-button');
  const decodeOutput = el('wm-decode-output');

  let dungeons = listDungeons({ missionType: 0 });

  fillSelect(missionTypeSelect, MISSION_TYPES);
  fillSelect(clientSelect, pokemonList);
  fillSelect(targetSelect, pokemonList);
  fillSelect(rewardItemSelect, rewardOptions, { valueKey: 'value' });
  makeIconCombo(itemSelect, itemIconUrl);
  makeIconCombo(rewardItemSelect, rewardIconUrl);
  makeIconCombo(clientSelect, pokemonIconUrl);
  makeIconCombo(targetSelect, pokemonIconUrl);
  makeIconCombo(dungeonSelect, () => null, formatDungeonOrFloorLabel);
  makeIconCombo(floorSelect, () => null, formatDungeonOrFloorLabel);
  setSelectValue(clientSelect, pokemonList.find((p) => p.name === 'Pikachu')?.id ?? pokemonList[1].id);

  // Excludes id 0, the "??????????" placeholder meaning "none chosen".
  function randomPokemon() {
    const choices = pokemonList.filter((p) => p.id !== 0);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function currentMissionType() {
    return MISSION_TYPES[Number(missionTypeSelect.value)];
  }

  // The variant "ring" isn't actually 256 values long for a given mission --
  // describeFlavor() (in the library) picks each line via `hash % pool.length`
  // for whichever text pool this mission's type/family uses, so the visible
  // text can repeat every few steps well before variant reaches 255 (e.g. 13
  // for a generic "Help me" mission at some dungeons). Reward and the actual
  // find/deliver item never affect this -- only mission type, dungeon, floor,
  // client and target feed the classification/hash -- so those are the only
  // fields that need to trigger a recompute. Brute-forced by walking variant
  // forward from 0 and diffing rendered text against the library itself,
  // rather than re-deriving its hash-and-modulo logic here by hand (that
  // logic has several branches -- parent/child, pairs, lovers, per-type
  // pools -- each with its own table lengths, and getting one wrong would
  // silently cap the range too short or too long).
  //
  // TODO: since every variant in [0, period) is a *different valid password*
  // for the exact same mission, this range is also a search space -- e.g.
  // picking whichever variant's password has the fewest/most-repeated
  // characters, or otherwise minimizes typing/entry effort on a real DS.
  // Worth a "shortest to type" mode later.
  function computeVariantPeriod() {
    const missionType = currentMissionType();
    const base = {
      missionType: missionType.id,
      dungeon: Number(dungeonSelect.value),
      floor: Number(floorSelect.value),
      client: Number(clientSelect.value),
      target: missionType.needsTarget ? Number(targetSelect.value) : undefined,
      item: missionType.needsItem ? Number(itemSelect.value) : undefined,
      reward: { kind: REWARD_KINDS.MONEY_ONLY }
    };
    try {
      const flavorKey = (variant) => {
        const m = buildMission({ ...base, variant });
        return `${m.mailTitle} ${m.mailBody.join(' ')}`;
      };
      const baseline = flavorKey(0);
      for (let variant = 1; variant < 256; variant++) {
        if (flavorKey(variant) === baseline) return variant;
      }
      return 256;
    } catch {
      return 256;
    }
  }

  let variantPeriod = 256;
  function refreshVariantRange() {
    variantPeriod = computeVariantPeriod();
    variantInput.max = String(variantPeriod - 1);
    el('wm-variant-max').textContent = String(variantPeriod - 1);
    const current = Number(variantInput.value) || 0;
    if (current >= variantPeriod) variantInput.value = current % variantPeriod;
  }

  // Dungeon options are labeled with their difficulty range (e.g. "Tiny
  // Woods (E)", "Fantasy Strait (B-A)"), which shifts for escort missions,
  // so the list is rebuilt whenever the mission type changes.
  function refreshDungeonOptions() {
    const previous = dungeonSelect.value;
    dungeons = listDungeons({ missionType: currentMissionType().id });
    fillSelect(
      dungeonSelect,
      dungeons.map((d) => ({ id: d.id, name: `${d.name} (${d.difficulty.label})` }))
    );
    if (dungeons.some((d) => String(d.id) === previous)) dungeonSelect.value = previous;
  }

  // Floor options are labeled with their exact difficulty letter for the
  // current mission type, e.g. "3 (D)".
  function refreshFloors() {
    const missionTypeId = currentMissionType().id;
    const dungeon = dungeons.find((d) => d.id === Number(dungeonSelect.value));
    const previous = Number(floorSelect.value) || 1;
    const floors = [];
    for (let f = 1; f < (dungeon ? dungeon.floors : 1); f++) {
      const letter = getDifficultyLetter(getDifficulty(missionTypeId, dungeon.id, f));
      floors.push({ id: f, name: `${f} (${letter})` });
    }
    fillSelect(floorSelect, floors);
    floorSelect.value = Math.min(previous, floors.length || 1);
    refreshMoneyAmount();
  }

  function refreshItemOptions() {
    const missionType = currentMissionType();
    const dungeonId = missionType.id === 3 ? Number(dungeonSelect.value) : undefined;
    fillSelect(itemSelect, sortedByName(listObjectiveItems({ dungeonId })));
  }

  function refreshVisibility() {
    const missionType = currentMissionType();
    refreshDungeonOptions();
    refreshFloors();
    targetField.hidden = !missionType.needsTarget;
    itemField.hidden = !missionType.needsItem;
    if (missionType.needsItem) refreshItemOptions();
  }

  // The money reward is always (difficulty + 1) x 200 -- both the money-only
  // and money-plus-item cases use the same doubled amount (see
  // rewardDescription() in the library). Shown right on the checkbox label so
  // "add money" isn't a mystery amount.
  function refreshMoneyAmount() {
    const missionType = currentMissionType();
    const difficulty = getDifficulty(missionType.id, Number(dungeonSelect.value), Number(floorSelect.value));
    const amount = (difficulty + 1) * 200;
    el('wm-reward-money-amount').textContent = amount;
  }

  // A mission without an item reward always gives money (there's no "neither"
  // option in the format), so the money checkbox only means something once an
  // item is chosen -- it's disabled, not just hidden, so its state can't lie
  // about what the mission actually does. Picking a Friend Area hides it
  // entirely (Friend Area rewards don't combine with money in this format).
  function refreshRewardVisibility() {
    const value = rewardItemSelect.value;
    const isArea = value.startsWith('area:');
    rewardMoneyField.hidden = isArea;
    if (!isArea) {
      const hasItem = value !== REWARD_NONE_VALUE;
      rewardMoneyCheckbox.disabled = !hasItem;
      if (!hasItem) rewardMoneyCheckbox.checked = true;
    }
    refreshMoneyAmount();
  }

  // Escapes `text` for HTML, then wraps every occurrence of each [needle, cls]
  // pair in a color span -- the way the game's own text wraps an interpolated
  // item/Pokémon name in a color code. Escaping happens once, up front, so
  // chaining highlights doesn't re-escape a span already inserted by an
  // earlier pass.
  function escapeAndHighlight(text, highlights) {
    let result = escapeHtml(text);
    for (const [needle, cls] of highlights) {
      if (!needle) continue;
      const escapedNeedle = escapeHtml(needle);
      result = result.split(escapedNeedle).join(`<span class="${cls}">${escapedNeedle}</span>`);
    }
    return result;
  }

  // Press Start 2P has no ♂/♀/… glyphs (see fonts.css), so those fall back to
  // the next font in the stack -- which draws them much smaller than the
  // pixel font's own blocky characters, and not on the same baseline as each
  // other. Wrapping each one lets CSS bump it back up to match visually;
  // ♂/♀ and … get different classes since they need different vertical
  // nudges to actually line up (see _wondermail.scss).
  function wrapGlyphs(html) {
    return html.replace(/[♂♀…]/g, (c) => `<span class="glyph ${c === '…' ? 'glyph-ellipsis' : 'glyph-gender'}">${c}</span>`);
  }

  // Each line is 3 space-separated groups of 4 ("??JN 44_? FP??"); the middle
  // group is the one worth calling out visually.
  function highlightMiddleGroup(line) {
    const groups = line.split(' ');
    if (groups.length !== 3) return line;
    return `${groups[0]} <span class="pmd-c-yellow">${groups[1]}</span> ${groups[2]}`;
  }

  function mailBoxHtml(mission) {
    const [line1, line2] = mission.passwordDisplay;
    const nameHighlights = [
      [mission.item.name, 'pmd-c-green'],
      [mission.target.name, 'pmd-c-green']
    ];
    const highlightNames = (text) => escapeAndHighlight(text, nameHighlights);
    return wrapGlyphs(`
      <div class="pmd-box">
        <div class="pmd-box-tab">Rescue Description</div>
        <div class="pmd-body">
          ${mission.mailBody.map((line) => `<p>${highlightNames(line)}</p>`).join('')}
        </div>
        <dl class="pmd-fields">
          <dt>Client:</dt><dd>${escapeHtml(mission.client.name)}</dd>
          <dt>Objective:</dt><dd>${highlightNames(mission.objective)}</dd>
          <dt>Place:</dt><dd><span class="pmd-c-yellow">${escapeHtml(mission.dungeon.name)}</span> <span class="pmd-c-cyan">${escapeHtml(mission.floorLabel)}</span></dd>
          <dt>Difficulty:</dt><dd>${colorizeRank(getDifficultyLetter(mission.difficulty))}</dd>
          <dt>Reward:</dt><dd>${escapeHtml(mission.reward)}</dd>
          <dt>Wonder Mail:</dt>
          <dd class="pmd-password-row">
            <span class="pmd-password-lines">
              <span>${highlightMiddleGroup(line1)}</span>
              <span>${highlightMiddleGroup(line2)}</span>
            </span>
            <button type="button" class="pmd-copy wondermail-copy">Copy</button>
          </dd>
        </dl>
      </div>
    `);
  }

  function wireCopyButtons(container, mission) {
    const [line1, line2] = mission.passwordDisplay;
    container.querySelectorAll('.wondermail-copy').forEach((copyButton) => {
      copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(`${line1} ${line2}`).then(
          () => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
              copyButton.textContent = 'Copy';
            }, 1500);
          },
          () => {
            copyButton.textContent = "Couldn't copy";
            setTimeout(() => {
              copyButton.textContent = 'Copy';
            }, 1500);
          }
        );
      });
    });
  }

  function render(container, mission) {
    container.innerHTML = mailBoxHtml(mission);
    wireCopyButtons(container, mission);
  }

  function renderError(container, message) {
    container.innerHTML = `<p class="wondermail-error">${escapeHtml(message)}</p>`;
  }

  function currentReward() {
    const value = rewardItemSelect.value;
    if (value.startsWith('area:')) {
      return { kind: REWARD_KINDS.FRIEND_AREA, friendArea: Number(value.slice(5)) };
    }
    if (value.startsWith('item:')) {
      const item = Number(value.slice(5));
      return { kind: rewardMoneyCheckbox.checked ? REWARD_KINDS.MONEY_PLUS_ITEM : REWARD_KINDS.ITEM_PLUS_MYSTERY, item };
    }
    return { kind: REWARD_KINDS.MONEY_ONLY };
  }

  function regenerate() {
    const missionType = currentMissionType();
    const reward = currentReward();
    const rewardCombo = rewardItemSelect.closest('.wm-combo');
    rewardCombo.classList.remove('wm-combo-invalid');

    try {
      const mission = buildMission({
        missionType: missionType.id,
        dungeon: Number(dungeonSelect.value),
        floor: Number(floorSelect.value),
        client: Number(clientSelect.value),
        target: missionType.needsTarget ? Number(targetSelect.value) : undefined,
        item: missionType.needsItem ? Number(itemSelect.value) : undefined,
        reward,
        variant: Number(variantInput.value) || 0
      });
      render(mailBox, mission);
    } catch (err) {
      if (err instanceof WonderMailError) {
        renderError(mailBox, err.message);
        // The only way buildMission rejects a reward outright (rather than
        // some other field) is an unavailable Friend Area -- highlight the
        // pick that's actually the problem, not just the message below it.
        if (reward.kind === REWARD_KINDS.FRIEND_AREA) rewardCombo.classList.add('wm-combo-invalid');
      } else {
        throw err;
      }
    }
  }

  root.addEventListener('change', (event) => {
    // Keeps a combo-ified select's custom button/list in sync even when its
    // value changes some way other than clicking its own listbox (e.g. a
    // browser autofill, or driving the underlying <select> directly).
    event.target._comboWidget?.refresh();
    if (event.target === dungeonSelect) {
      refreshFloors();
      refreshItemOptions();
    }
    if (event.target === floorSelect) {
      refreshMoneyAmount();
    }
    if (event.target === missionTypeSelect) {
      refreshVisibility();
    }
    if (event.target === rewardItemSelect) {
      refreshRewardVisibility();
    }
    if ([missionTypeSelect, dungeonSelect, floorSelect, clientSelect, targetSelect].includes(event.target)) {
      refreshVariantRange();
    }
    regenerate();
  });
  root.addEventListener('input', (event) => {
    if (event.target === variantInput) regenerate();
  });

  clientRandomize.addEventListener('click', () => {
    setSelectValue(clientSelect, randomPokemon().id);
    refreshVariantRange();
    regenerate();
  });
  targetRandomize.addEventListener('click', () => {
    setSelectValue(targetSelect, randomPokemon().id);
    refreshVariantRange();
    regenerate();
  });

  variantShuffle.addEventListener('click', () => {
    variantInput.value = Math.floor(Math.random() * variantPeriod);
    regenerate();
  });

  // Message variant rings around at variantPeriod (see computeVariantPeriod
  // above), not a fixed 256 -- stepping past either end should land back on
  // the other, not stick. Wraps rather than clamps on the custom +/- buttons
  // *and* the input's own arrow keys (which would otherwise clamp via the
  // native min/max), so every way of stepping behaves the same.
  function stepVariant(delta) {
    const current = Number(variantInput.value) || 0;
    variantInput.value = (((current + delta) % variantPeriod) + variantPeriod) % variantPeriod;
    regenerate();
  }
  variantDown.addEventListener('click', () => stepVariant(-1));
  variantUp.addEventListener('click', () => stepVariant(1));
  variantInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      stepVariant(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      stepVariant(-1);
    }
  });

  decodeButton.addEventListener('click', () => {
    try {
      const mission = readMission(decodeInput.value);
      render(decodeOutput, mission);
    } catch (err) {
      if (err instanceof WonderMailError) {
        renderError(decodeOutput, err.message);
      } else {
        throw err;
      }
    }
  });

  // Game tabs: one button + panel per supported game, one active at a time.
  // Reads aria-controls rather than hardcoded ids so a second game (PMD Sky)
  // can be added later as just another button+panel pair in the markdown,
  // with no JS change needed here.
  const gameTabs = Array.from(root.querySelectorAll('.wondermail-tabs .wondermail-tab'));
  gameTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      gameTabs.forEach((t) => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        el(t.getAttribute('aria-controls')).hidden = !active;
      });
    });
  });

  refreshVisibility();
  refreshRewardVisibility();
  refreshVariantRange();
  regenerate();
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-wondermail-app]');
  if (root) init(root);
});
