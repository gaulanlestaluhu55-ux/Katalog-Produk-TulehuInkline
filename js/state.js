/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let allProducts = [];
const state = {};
const expanded = {}; // idx -> boolean, dijaga lintas render biar gak balik collapse pas search/filter

function initState(idx) {
  if (!state[idx]) state[idx] = { size: null, sleeve: null, color: null, nameset: null, qty: 1 };
  if (expanded[idx] === undefined) expanded[idx] = false;
}
