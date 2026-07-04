/* ═══════════════════════════════════════════════════════
   WA MESSAGE
═══════════════════════════════════════════════════════ */
function buildOrderMsg(p, idx) {
  const s = state[idx];
  const unitPrice  = getUnitPrice(p, idx);
  const totalPrice = getTotalPrice(p, idx);

  const lines = [
    '🛒 *PESANAN SABLON*',
    '─────────────────────',
    `Produk   : *${p.nama}*`,
  ];

  if (isKaos(p)) {
    const surcharge = getSurcharge(s);
    const base = toNum(p.harga);
    lines.push(`Ukuran   : ${s.size}`);
    lines.push(`Lengan   : ${s.sleeve}`);
    lines.push(`Warna    : ${s.color}`);
    lines.push(`Qty      : ${s.qty} pcs`);
    lines.push('─────────────────────');
    lines.push(`Harga dasar : ${fmt(base)}${p.satuan||'/pcs'}`);
    if (surcharge > 0) {
      if (s.sleeve === 'Lengan Panjang') lines.push(`+ Lengan panjang : ${fmt(CONFIG.surcharge.lenganPanjang)}`);
      if (s.size === 'XXL')  lines.push(`+ Oversize XXL   : ${fmt(CONFIG.surcharge.xxl)}`);
      if (s.size === '3XL')  lines.push(`+ Oversize 3XL   : ${fmt(CONFIG.surcharge.xxxl)}`);
      lines.push(`Harga satuan : ${fmt(unitPrice)}${p.satuan||'/pcs'}`);
    }
    lines.push(`*Total (${s.qty} pcs) : ${fmt(totalPrice)}*`);
  }

  if (isJersey(p)) {
    const nsPrice = getNameSetPrice(p, s.nameset);
    const base = toNum(p.harga);
    lines.push(`Name set : ${s.nameset}`);
    lines.push(`Qty      : ${s.qty} pcs`);
    lines.push('─────────────────────');
    lines.push(`Jasa sablon  : ${fmt(base)}${p.satuan||'/pcs'}`);
    if (nsPrice > 0) lines.push(`+ Name set   : ${fmt(nsPrice)}/pcs`);
    lines.push(`Harga satuan : ${fmt(unitPrice)}/pcs`);
    lines.push(`*Total (${s.qty} pcs) : ${fmt(totalPrice)}*`);
    lines.push('📌 Bahan jersey dibawa customer');
  }

  lines.push('─────────────────────');
  lines.push('Mohon konfirmasi pesanan. Terima kasih! 🙏');
  return lines.join('\n');
}
