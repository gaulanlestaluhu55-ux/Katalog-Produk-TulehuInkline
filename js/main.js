document.getElementById('headerWaBtn').href =
  `https://wa.me/${CONFIG.waNumber}?text=${encodeURIComponent(CONFIG.waDefaultMsg)}`;

loadProducts();
