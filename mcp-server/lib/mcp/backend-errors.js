// Fixed messages only; untrusted upstream content is never interpolated.
const MESSAGES=Object.freeze({
 BULK_INVALID_INPUT:'Input bulk tidak valid. Periksa produk, varian dan diskon.',
 BULK_INVALID_CUTTING:'Cuttingan harus Reguler atau Oversize.',
 BULK_INVALID_ITEMS:'Jumlah baris varian harus 1–100.',
 BULK_INVALID_QTY:'Qty per baris harus bilangan bulat 1–10000.',
 BULK_QTY_LIMIT:'Total qty setelah penggabungan satu varian maksimal 10000.',
 BULK_SIZE_UNAVAILABLE:'Ukuran tidak tersedia untuk produk ini. Periksa opsi produk.',
 BULK_COLOR_UNAVAILABLE:'Warna tidak tersedia untuk produk ini. Periksa opsi produk.',
 BULK_INVALID_SLEEVE:'Jenis lengan tidak valid.',
 PRODUCT_NOT_FOUND:'Produk aktif tidak ditemukan.',
 PRICE_CHANGED:'Harga berubah. Jalankan preview ulang dan gunakan total terbaru.',
 INVALID_PRICING:'Harga atau diskon tidak valid.',
 INVALID_INPUT:'Input tidak valid. Periksa parameter.',
 PAYMENT_CONFLICT:'Riwayat pembayaran atau nominal terbaru tidak cocok. Baca ulang pesanan.',
 ORDER_CONFLICT:'Total atau pembayaran pesanan berubah. Baca ulang pesanan.',
 STATUS_CONFLICT:'Status pesanan berubah. Baca ulang pesanan.',
 PRODUCT_CONFLICT:'Status produk berubah. Baca ulang produk.',
 IDEMPOTENCY_CONFLICT:'Request ID sudah digunakan untuk input berbeda.',
 OPERATIONS_DISABLED:'Operasi write belum diaktifkan.',
 FINANCE_DISABLED:'Operasi keuangan belum diaktifkan.',
 AUDIT_UNAVAILABLE:'Audit receipt tidak tersedia; operasi ditolak.',
 OPERATION_REJECTED_OR_UNCERTAIN:'Operasi gagal atau hasil belum dapat dipastikan. Baca ulang data.',
 MCP_READ_INCOMPLETE:'Pagination belum lengkap atau data berubah. Ulangi pembacaan.'
});
export function backendErrorMessage(code){
 return typeof code==='string'&&Object.hasOwn(MESSAGES,code)?MESSAGES[code]:null;
}
