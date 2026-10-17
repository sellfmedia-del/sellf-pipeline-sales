/* Offer UI is isolated from the CRM data model and its bulk save function.
 * Stage 1 only: no requests, persistence, credentials or generated offers.
 */
(function () {
  'use strict';

  function mount(container) {
    if (!container) return;
    container.innerHTML = `
      <h2 class="sidebar-key">Teklif</h2>
      <p class="offer-empty">Henüz teklif oluşturulmadı.</p>
      <dl class="offer-details">
        <div><dt>Durum</dt><dd>Oluşturulmadı</dd></div>
        <div><dt>Müşteri bağlantısı</dt><dd>—</dd></div>
        <div><dt>Şifre</dt><dd>—</dd></div>
        <div><dt>Sürüm</dt><dd>—</dd></div>
      </dl>
      <button type="button" class="btn btn-primary offer-create" disabled
        aria-describedby="offer-availability">Teklif Oluştur</button>
      <p class="offer-help" id="offer-availability">Teklif hazırlama henüz kullanıma açılmadı.</p>`;
  }

  window.PipelineOffers = Object.freeze({ mount });
})();
