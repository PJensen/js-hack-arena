import { getMiningMaterial, miningMaterialIds } from '../src/rules/data/miningMaterials.js';

import { getRecipe } from '../src/rules/data/craftingRecipes.js';

import { availableCraftSlots, pendingCapacity } from '../src/rules/crafting.js';

const copperRecipe = getRecipe('smelt_copper');
const oreCost = copperRecipe.inputs.copper_ore;
let character = null;
let clockOffset = 0;
let loading = false;
let submitting = false;
let pendingRequest = null;
let quantity = 1;
let statusMessage = '';

const modes = [
  { name: 'Smelting', icon: 'ingot copper', description: 'Refine ore into ingots', view: 'smelting' },
  { name: 'Smithing', icon: 'hammer', description: 'Craft and upgrade gear' },
  { name: 'Jewelry', icon: 'jewel', description: 'Cut gems and craft trinkets' },
  { name: 'Alchemy', icon: 'flask', description: 'Brew potions and elixirs' },
  { name: 'Enchanting', icon: 'spark', description: 'Imbue gear with power' },
];

const recipes = [
  { kind: 'copper', minutes: copperRecipe.workMs / 60_000 },
  { kind: 'tin', minutes: 15, locked: true },
  { kind: 'bronze', minutes: 20, locked: true },
  { kind: 'gold', minutes: 45, locked: true },
];

const runs = [
  { name: 'The Quarry', levels: '8–14', icon: 'crystal blue' },
  { name: 'Gloomroot Caverns', levels: '12–18', icon: 'crystal violet' },
  { name: 'Irondeep Mine', levels: '16–22', icon: 'flame' },
];

const party = [
  { name: 'Ssera', role: 'leader', status: 'Lv 12' },
  { name: 'Vale', role: 'scout', status: 'Ready' },
  { name: 'Nyx', role: 'mage', status: 'Ready' },
];

function outstandingJobs() { return (character?.craftingJobs ?? []).filter(job => job.completedAt == null); }
function activeJobs() {
  const now = Date.now() + clockOffset;
  return outstandingJobs().filter(job => job.startsAt <= now && job.completesAt > now);
}
function pendingJobs() {
  const now = Date.now() + clockOffset;
  return outstandingJobs().filter(job => job.startsAt > now);
}
function maxQuantity() {
  if (!character) return 0;
  return Math.max(0, Math.min(
    availableCraftSlots(character, copperRecipe.profession),
    Math.floor(character.gold / copperRecipe.goldCost),
    Math.floor((character.materials?.copper_ore ?? 0) / oreCost),
  ));
}
function completedJobs() { return (character?.craftingJobs ?? []).filter(job => job.completedAt != null).reverse(); }
function jobProgress(job) {
  return Math.max(0, Math.min(100, Math.floor(100 * (Date.now() + clockOffset - job.startsAt) / (job.completesAt - job.startsAt))));
}
function remainingSeconds(job) { return Math.max(0, Math.ceil((job.completesAt - Date.now() - clockOffset) / 1000)); }

const params = new URLSearchParams(location.search);
const requestedView = params.get('view');
const view = ['craft', 'smelting', 'queue', 'inventory'].includes(requestedView) ? requestedView : 'run';
const completed = params.get('status') === 'completed';
const offline = params.has('offline');
const title = { run: 'Select a Run', craft: 'Crafting', smelting: 'Smelting', queue: 'Crafting Queue', inventory: 'Inventory' };
const gameParams = new URLSearchParams();
for (const name of ['room', 'offline']) {
  if (params.has(name)) gameParams.set(name, params.get(name));
}

function icon(name) {
  const symbols = {
    run: '⚔', hammer: '⚒', spark: '✦', jewel: '◇', menu: '☰', party: '♟', clock: '◷',
    plus: '+', coin: '●', crown: '♛',
  };
  return `<span class="icon ${name}" aria-hidden="true">${symbols[name] ?? ''}</span>`;
}

function href(screen, status = '') {
  const query = new URLSearchParams(gameParams);
  query.set('view', screen);
  if (status) query.set('status', status);
  return `?${query.toString().replaceAll('&', '&amp;')}`;
}

function navigation() {
  const tabs = [
    ['Run', 'run', 'run'], ['Craft', 'craft', 'craft'],
    ['Character', 'helmet'], ['Inventory', 'pack', 'inventory'],
  ];
  const section = view === 'smelting' || view === 'queue' ? 'craft' : view;
  return tabs.map(([label, glyph, screen]) => {
    const content = `${icon(glyph)}<span>${label}</span>`;
    return screen
      ? `<a class="nav-item" href="${href(screen)}" ${section === screen ? 'aria-current="true"' : ''}>${content}</a>`
      : `<button class="nav-item" type="button" disabled>${content}</button>`;
  }).join('');
}

function materialIcon(id, { shape, color }) {
  if (shape === 'rock') return icon(`ore ${id.split('_')[0]}`);
  const rgb = color.map((channel) => Math.round(channel * 255)).join(' ');
  return `<span class="icon crystal bank-gem" aria-hidden="true" style="--gem-color: rgb(${rgb})"></span>`;
}

function bankedStacks(materials) {
  return [...miningMaterialIds, 'copper_ingot'].flatMap((id) => {
    const count = materials?.[id];
    if (!Number.isSafeInteger(count) || count <= 0) return [];
    if (id === 'copper_ingot') return [{ name: copperRecipe.name, count: count.toLocaleString(), glyph: icon('ingot copper') }];
    const material = getMiningMaterial(id);
    return [{ name: material.name, count: count.toLocaleString(), glyph: materialIcon(id, material) }];
  });
}

function renderBalance(state) {
  const { gold, materials } = state;
  if (!Number.isSafeInteger(gold) || gold < 0) throw new Error('Invalid character balance');
  character = state;
  if (Number.isFinite(state.serverNow)) clockOffset = state.serverNow - Date.now();
  const stacks = bankedStacks(materials);
  const header = document.querySelector('.balances');
  header.innerHTML = `${stacks.slice(0, 5).map(({ name, count, glyph }) => `
    <span class="balance-material" title="${name}">${glyph}<span class="sr-only">${name} </span>${count}</span>`).join('')}
    <span>${icon('coin')}<span class="sr-only">Gold </span>${gold.toLocaleString()}</span>`;
  header.hidden = false;

  const copper = document.querySelector('#copper-balance');
  if (copper) {
    const count = Number.isSafeInteger(materials?.copper_ore) && materials.copper_ore > 0 ? materials.copper_ore : 0;
    copper.textContent = `${count.toLocaleString()} / ${oreCost}`;
    copper.classList.toggle('good', count >= oreCost);
  }

  updateCrafting();
  const bank = document.querySelector('#bank-content');
  if (!bank) return;
  document.querySelector('#bank-gold').textContent = `${gold.toLocaleString()} Gold`;
  bank.innerHTML = stacks.length ? `<ul class="bank-grid">${stacks.map(({ name, count, glyph }) => `
    <li class="row bank-item">${glyph}<strong>${name}</strong><span>×${count}</span></li>`).join('')}</ul>`
    : '<p class="bank-message">Your bank is empty. Deposit ore and gems at the camp chest to see them here.</p>';
}

async function loadBalance() {
  if (loading || submitting) return;
  loading = true;
  updateCrafting();
  const bank = document.querySelector('#bank-content');
  try {
    if (offline) {
      const saved = JSON.parse(localStorage.getItem('hack-arena.offline-progress'));
      renderBalance({ gold: 0, ...saved });
      return;
    }
    const endpoint = new URL('/api/character', location.href);
    if (params.has('room')) endpoint.searchParams.set('room', params.get('room'));
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      statusMessage = 'Sign in to craft.';
      updateCrafting();
      if (bank) {
        const returnTo = encodeURIComponent(location.pathname + location.search);
        bank.innerHTML = `<p class="bank-message">Sign in to see your banked materials and gold.</p>
          <a class="bank-action" href="/auth/login?return=${returnTo}">Sign in</a>`;
      }
      return;
    }
    if (!response.ok) throw new Error('Could not load character balance');
    statusMessage = '';
    renderBalance(await response.json());
  } catch {
    statusMessage = 'Character balance unavailable. Reload to try again.';
    updateCrafting();
    if (bank) bank.innerHTML = '<p class="bank-message">Bank balance unavailable. Reload to try again.</p>';
  } finally { loading = false; updateCrafting(); }
}

function back(screen, label) {
  return `<a class="back" href="${href(screen)}" aria-label="${label}"></a>`;
}

function runScreen() {
  return `
    <div class="run-hero" role="img" aria-label="A fire and tent inside the cave camp"></div>
    <div class="run-panels">
      <section aria-labelledby="party-title">
        <div class="section-heading">
          <h2 id="party-title">${icon('party')} Party</h2><span>3 / 4</span>
        </div>
        <div class="panel party-card">
          ${party.map(({ name, role, status }) => `
            <div class="party-row">
              <span class="avatar ${role}" aria-hidden="true">${name[0]}</span>
              <strong>${role === 'leader' ? `${icon('crown')} ${name} <small>(You)</small>` : name}</strong>
              <span class="${status === 'Ready' ? 'good' : ''}">${status === 'Ready' ? '✓ ' : ''}${status}</span>
            </div>`).join('')}
          <button type="button" class="invite" disabled>${icon('plus')} Invite Player</button>
        </div>
      </section>
      <section aria-labelledby="run-title">
        <div class="section-heading"><h1 id="run-title">${icon('run')} Select a Run</h1></div>
        <ul class="run-list">
          ${runs.map(({ name, levels, icon: glyph }, index) => `
            <li class="row run-card ${index === 0 ? 'selected' : ''}">
              ${icon(glyph)}
              <span class="row-copy">
                <strong>${name}</strong><small>Lv ${levels} ${icon('party')}</small>
              </span>
              ${index === 0 ? '<span class="sr-only">Selected</span>' : ''}
              <span class="chevron" aria-hidden="true"></span>
            </li>`).join('')}
        </ul>
        <button type="button" class="primary start-run" disabled>${icon('run')} Start Run</button>
      </section>
    </div>`;
}

function craftModes(compact = false) {
  return `<div class="craft-modes ${compact ? 'compact' : ''}">${modes.map(({ name, icon: glyph, description, view: screen }) => {
    const content = `
      ${icon(glyph)}
      <span class="row-copy"><strong>${name}</strong>${compact ? '' : `<small>${description}</small>`}</span>
      ${compact ? '' : '<span class="chevron" aria-hidden="true"></span>'}`;
    return screen
      ? `<a class="row ${compact ? 'selected' : ''}" href="${href(screen)}" ${compact ? 'aria-current="page"' : ''}>${content}</a>`
      : `<button class="row" type="button" disabled>${content}</button>`;
  }).join('')}</div>`;
}

function queueLink() {
  return `
    <a class="panel queue-link" href="${href('queue')}">
      <h2>Crafting Queue</h2>
      <div class="queue-link-content">
        ${icon('ingot copper')}
        <div class="row-copy">${activeJobs().length} active · ${pendingJobs().length} queued ${progress(activeJobs()[0] ? jobProgress(activeJobs()[0]) : 0, 'Crafting queue progress')}</div>
        <span class="chevron" aria-hidden="true"></span>
      </div>
    </a>`;
}

function craftingScreen() {
  return `
    <div class="craft-hero">
      <h1>Crafting</h1>
      <p>Refine, craft, brew and enhance equipment from materials gathered on your runs.</p>
    </div>
    <div class="craft-overview">
      ${craftModes()}
      ${queueLink()}
    </div>`;
}

function recipeList() {
  return `
    <section class="panel recipe-list" aria-label="Smelting recipes">
      <h2 class="wide-only">Recipes</h2>
      <ul>${recipes.map(({ kind, minutes, locked }) => `
        <li class="row recipe ${kind === 'copper' ? 'selected' : ''}">
          ${icon(`ingot ${kind}`)}
          <span class="row-copy">
            <strong class="item-name">${kind} Ingot</strong>
            <small class="wide-only">${icon('clock')} ${minutes} min</small>
          </span>
          <span class="wide-only ${locked ? 'lock' : 'good'}" aria-label="${locked ? 'Locked' : 'Available'}" role="img">${locked ? '' : '✓'}</span>
          ${kind === 'copper' ? '<span class="sr-only">Selected recipe</span>' : ''}
        </li>`).join('')}</ul>
    </section>`;
}

function recipeDetails() {
  return `
    <section class="panel recipe-details" aria-labelledby="recipe-title">
      <header class="recipe-header">
        ${icon('ingot copper')}
        <div><h2 id="recipe-title">Copper Ingot</h2><p>Refined copper for forging and crafting.</p></div>
      </header>
      <div class="detail-group">
        <h3>Requirements <span>(total)</span></h3>
        <div class="row material">${icon('ore')} <span>Copper Ore</span><strong id="copper-balance">— / ${oreCost}</strong></div>
        <div class="row material">${icon('coin')} <span>Gold</span><strong id="craft-gold">— / ${copperRecipe.goldCost}</strong></div>
      </div>
      <div class="detail-group">
        <h3>Output <span>(total)</span></h3>
        <div class="row material">${icon('ingot copper')} <span id="craft-output">Copper Ingot ×1</span></div>
      </div>
      <div class="craft-time"><span>${icon('clock')} Time (per craft)</span><strong>${copperRecipe.workMs / 60_000} min</strong></div>
      <div class="craft-quantity">
        <div>
          <h3>Quantity</h3>
          <div class="stepper">
            <button id="craft-minus" type="button" aria-label="Decrease quantity" disabled>−</button>
            <span id="craft-quantity" aria-label="Quantity">1</span>
            <button id="craft-plus" type="button" aria-label="Increase quantity" disabled>+</button>
          </div>
        </div>
        <div class="total-time"><h3>Total Time</h3><span>${icon('clock')} <span id="craft-total-time">${copperRecipe.workMs / 60_000} min</span></span></div>
      </div>
      <button id="queue-craft" type="button" class="primary" disabled>${icon('hammer')} Queue Craft</button>
      <p id="craft-status" role="status"></p>
    </section>`;
}

function progress(value, label) {
  return `<div class="progress" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
    <span style="--progress: ${value}%"></span>
  </div>`;
}

function queueTabs(screen) {
  return `
    <nav class="queue-tabs" aria-label="Crafting queue status">
      <a href="${href(screen, 'active')}" ${completed ? '' : 'aria-current="page"'}>Active (${outstandingJobs().length})</a>
      <a href="${href(screen, 'completed')}" ${completed ? 'aria-current="page"' : ''}>Completed (${completedJobs().length})</a>
    </nav>`;
}

function queueJob({ kind, quantity, minutes, progress: value, queued = false }) {
  const status = queued ? `⌛ Queued · ${Math.ceil(minutes)} min until start` : value == null ? '✓ Complete' : `${Math.floor(minutes)}m ${Math.ceil(minutes * 60) % 60}s remaining`;
  return `
    <li class="row job">
      ${icon(`ingot ${kind}`)}
      <div class="row-copy">
        <strong class="item-name">${kind} Ingot ×${quantity}</strong>
        <small>${status}</small>
        ${value == null ? '' : `<div class="job-progress">${progress(value, `${kind} ingot progress`)}<span>${value}%</span></div>`}
      </div>
      <button class="job-menu" type="button" aria-label="${kind} ingot job options" disabled>⋮</button>
    </li>`;
}

function queue(screen) {
  const entries = completed ? completedJobs() : outstandingJobs().filter(job => job.startsAt <= Date.now() + clockOffset);
  const waiting = completed ? [] : pendingJobs();
  return `
    <section class="panel queue-panel" aria-label="Crafting Queue" data-queue-screen="${screen}">
      ${screen === 'smelting' ? '<h2>Crafting Queue</h2>' : ''}
      ${queueTabs(screen)}
      <ul class="jobs">${entries.map(job => queueJob({ kind: 'copper', quantity: job.quantity,
        minutes: remainingSeconds(job) / 60, progress: job.completedAt == null ? jobProgress(job) : undefined })).join('')}</ul>
      ${waiting.length ? `<section class="panel queued"><h3>Queued (${waiting.length})</h3><ul class="jobs">${waiting.map(job =>
        queueJob({ kind: 'copper', quantity: job.quantity, queued: true,
          minutes: Math.max(0, job.startsAt - Date.now() - clockOffset) / 60_000 })).join('')}</ul></section>` : ''}
      ${entries.length || waiting.length ? '' : '<p class="bank-message">No crafting jobs.</p>'}
    </section>`;
}

function smeltingScreen() {
  return `
    <div class="screen-heading smelting-heading">
      ${back('craft', 'Back to Crafting')}
      <h1><span class="narrow-only">Smelting</span><span class="wide-only">Crafting</span></h1>
    </div>
    <div class="wide-only">${craftModes(true)}</div>
    <div class="workbench">
      ${recipeList()}
      ${recipeDetails()}
      <div class="wide-only">${queue('smelting')}</div>
      <div class="narrow-only">${queueLink()}</div>
    </div>`;
}

function queueScreen() {
  return `
    <div class="screen-heading">
      ${back('smelting', 'Back to Smelting')}<h1>Crafting Queue</h1>
    </div>
    ${queue('queue')}`;
}

function inventoryScreen() {
  const gameQuery = gameParams.toString().replaceAll('&', '&amp;');
  return `
    <div class="screen-heading"><h1>Inventory</h1></div>
    <section class="panel bank-panel" aria-labelledby="bank-title">
      <div class="bank-heading">
        <h2 id="bank-title">Banked Materials</h2>
        <span id="bank-gold"></span>
      </div>
      <div id="bank-content" aria-live="polite"><p class="bank-message">Loading your bank…</p></div>
      <a class="bank-action" href="/${gameQuery ? `?${gameQuery}` : ''}">Open Game</a>
    </section>`;
}

const screens = { run: runScreen, craft: craftingScreen, smelting: smeltingScreen, queue: queueScreen, inventory: inventoryScreen };
document.title = `${title[view]} | Hack Arena Preview`;
document.querySelector('#preview').innerHTML = `
  <header class="topbar">
    <button class="top-action" type="button" aria-label="Menu" disabled>${icon('menu')}</button>
    <span class="brand" aria-label="Hack Arena">HACK<span>//ARENA</span></span>
    <a class="balances" href="${href('inventory')}" hidden></a>
    <button class="top-action notifications" type="button" aria-label="Notifications" disabled>${icon('bell')}</button>
  </header>
  <nav class="primary-nav ${view === 'smelting' || view === 'queue' ? 'subscreen' : ''}" aria-label="Arena sections">
    ${navigation()}
  </nav>
  <main class="screen screen-${view}">${screens[view]()}</main>`;
function updateCrafting() {
  const button = document.querySelector('#queue-craft');
  const status = document.querySelector('#craft-status');
  const gold = document.querySelector('#craft-gold');
  const copper = document.querySelector('#copper-balance');
  const max = maxQuantity();
  if (!pendingRequest) quantity = Math.max(1, Math.min(quantity, max));
  const locked = offline || loading || submitting || !!pendingRequest;
  const minus = document.querySelector('#craft-minus');
  const plus = document.querySelector('#craft-plus');
  if (minus) minus.disabled = locked || quantity <= 1;
  if (plus) plus.disabled = locked || quantity >= max;
  if (character && gold) {
    gold.textContent = character.gold + ' / ' + copperRecipe.goldCost * quantity;
    gold.classList.toggle('good', character.gold >= copperRecipe.goldCost * quantity);
  }
  if (character && copper) {
    const count = character.materials?.copper_ore ?? 0;
    copper.textContent = count + ' / ' + oreCost * quantity;
    copper.classList.toggle('good', count >= oreCost * quantity);
  }
  const count = document.querySelector('#craft-quantity');
  const time = document.querySelector('#craft-total-time');
  const output = document.querySelector('#craft-output');
  if (count) count.textContent = quantity;
  if (time) time.textContent = copperRecipe.workMs * quantity / 60_000 + ' min';
  if (output) output.textContent = copperRecipe.name + ' ×' + quantity;
  if (button) {
    button.disabled = offline || loading || submitting || (!pendingRequest && max < 1);
    button.innerHTML = icon('hammer') + (pendingRequest && !submitting ? ' Retry Craft' : ' Queue Craft');
  }
  const professionJobs = outstandingJobs().filter(job => job.profession === copperRecipe.profession);
  const capacity = character ? pendingCapacity(character, copperRecipe.profession) : 0;
  if (status) status.textContent = statusMessage || (offline ? 'Crafting requires an online character.' :
    !character ? 'Loading character…' : 'Smelting: ' + professionJobs.length + ' / ' + (1 + capacity) +
    ' slots used (1 active + ' + capacity + ' pending). ' +
    (!max ? (availableCraftSlots(character, copperRecipe.profession) === 0 ? 'Queue full.' : 'Not enough materials or gold.') : ''));
  document.querySelectorAll('.queue-link').forEach(element => { element.outerHTML = queueLink(); });
  document.querySelectorAll('[data-queue-screen]').forEach(element => { element.outerHTML = queue(element.dataset.queueScreen); });
}

document.querySelector('#craft-minus')?.addEventListener('click', () => {
  if (!pendingRequest && !submitting && quantity > 1) { quantity--; updateCrafting(); }
});
document.querySelector('#craft-plus')?.addEventListener('click', () => {
  if (!pendingRequest && !submitting && quantity < maxQuantity()) { quantity++; updateCrafting(); }
});
document.querySelector('#queue-craft')?.addEventListener('click', async () => {
  if (submitting || offline || loading || (!pendingRequest && quantity > maxQuantity())) return;
  submitting = true;
  statusMessage = '';
  pendingRequest ??= { recipeId: copperRecipe.id, requestId: crypto.randomUUID(), quantity };
  updateCrafting();
  try {
    const endpoint = new URL('/api/character/crafting', location.href);
    if (params.has('room')) endpoint.searchParams.set('room', params.get('room'));
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pendingRequest) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500) pendingRequest = null;
      throw new Error(result.error || 'Could not queue craft');
    }
    pendingRequest = null;
    quantity = 1;
    renderBalance(result);
  } catch (error) {
    statusMessage = error.message || 'Could not queue craft. Try again.';
  } finally {
    submitting = false;
    updateCrafting();
  }
});

loadBalance();
setInterval(() => {
  const jobs = outstandingJobs();
  if (!jobs.length) return;
  if (jobs.some(job => remainingSeconds(job) === 0) && !loading && !submitting) loadBalance();
  updateCrafting();
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !offline) loadBalance(); });
