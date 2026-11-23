const copy = {
  tr: {
    home: '/', contact: '/iletisim', search: '/teklifinizi-arayin', ratecard: '/ratecard',
    skip: 'İçeriğe geç', brand: 'Sellf ana sitesi', nav: 'Ana menü', language: 'Dil seçimi',
    homeLabel: 'Ana sayfa', contactLabel: 'İletişim', searchLabel: 'Teklifinizi bulun',
    heading: 'Operasyon fiyatları', locked: 'Ratecard şifresini girerek operasyon fiyatlarını görüntüleyin.',
    prompt: 'Ratecard erişimi', password: 'Ratecard şifresi', unlock: 'Fiyatları görüntüle', lock: 'Oturumu kapat',
    unavailable: 'Ratecard şu anda kullanılamıyor.', invalid: 'Lütfen şifreyi yeniden girin.', wrong: 'Şifre hatalı. Tekrar deneyin.',
    period: 'Aylık hizmet bedelleri · TL', note: 'KDV, reklam bütçesi ve üçüncü taraf bedelleri ayrıca değerlendirilir.',
    columns: ['Operasyon', 'KOBİ', 'Kurumsal', 'Key Account'], scoped: 'Kapsama göre', listPrice: 'liste bedeli üzerinden',
  },
  en: {
    home: '/en', contact: '/en/contact', search: '/en/find-your-proposal', ratecard: '/en/ratecard',
    skip: 'Skip to content', brand: 'Sellf main website', nav: 'Main navigation', language: 'Language',
    homeLabel: 'Home', contactLabel: 'Contact', searchLabel: 'Find your proposal',
    heading: 'Operations pricing', locked: 'Enter the Ratecard password to view operations pricing.',
    prompt: 'Ratecard access', password: 'Ratecard password', unlock: 'View prices', lock: 'Sign out',
    unavailable: 'The Ratecard is currently unavailable.', invalid: 'Please enter the password again.', wrong: 'Incorrect password. Try again.',
    period: 'Monthly service fees · TRY', note: 'VAT, ad spend and third-party fees are assessed separately.',
    columns: ['Operations service', 'SME', 'Corporate', 'Key Account'], scoped: 'Scope-based quote', listPrice: 'of list price',
  },
};

function renderRates(language, labels, operations) {
  const format = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-GB');
  const rows = operations.map(({ [language]: name, rates }) => `<tr>
    <th scope="row">${name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</th>
    ${rates.map(rate => {
      if (rate === null) return `<td><span class="ratecard-conditional">${labels.scoped}</span></td>`;
      if (typeof rate === 'number') return `<td><data value="${rate}">${format.format(rate)}</data></td>`;
      const percentage = new Intl.NumberFormat(language, { style: 'percent' }).format(rate.percent / 100);
      return `<td><div>${percentage}</div><small class="ratecard-conditional">${labels.listPrice}</small></td>`;
    }).join('\n    ')}
  </tr>`).join('\n');

  return `<section class="ratecard-content wrap" aria-labelledby="ratecard-heading">
    <div class="ratecard-heading">
      <h1 id="ratecard-heading">${labels.heading}</h1>
      <form method="post" action="${labels.ratecard}"><button class="ratecard-signout" name="action" value="lock">${labels.lock}</button></form>
    </div>
    <div class="ratecard-table" role="region" tabindex="0" aria-label="${labels.period}">
      <table>
        <caption>${labels.period}</caption>
        <thead><tr>${labels.columns.map(column => `<th scope="col">${column}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="ratecard-note">${labels.note}</p>
  </section>`;
}

function renderAccess(labels, message) {
  const error = message ? `<p id="ratecard-status" class="ratecard-error" role="alert">${labels[message]}</p>` : '';
  const access = message === 'unavailable' ? error : `<form method="post" action="${labels.ratecard}">
    <label for="ratecard-password">${labels.password}</label>
    <input id="ratecard-password" type="password" name="password" autocomplete="current-password" maxlength="128" required${error ? ' aria-invalid="true" aria-describedby="ratecard-status"' : ''}>
    ${error}
    <button type="submit" class="button primary">${labels.unlock} <span aria-hidden="true">↗</span></button>
  </form>`;

  return `<div class="search-page wrap">
    <div><p class="eyebrow">SELLF · RATECARD</p><h1>${labels.heading}</h1><p class="lead">${labels.locked}</p></div>
    <section class="contact-panel ratecard-access" aria-labelledby="ratecard-access-title">
      <h2 id="ratecard-access-title">${labels.prompt}</h2>${access}
    </section>
  </div>`;
}

export function renderRatecard(language, { operations, message } = {}) {
  const labels = copy[language];
  const currentLanguage = ' aria-current="true"';
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#145cd6">
  <title>Ratecard · Sellf Offerletter</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/portal.css">
  <link rel="stylesheet" href="/ratecard.css">
</head>
<body>
  <a class="skip" href="#main">${labels.skip}</a>
  <header class="site-header wrap">
    <a class="brand" href="https://www.sellfmedia.com" aria-label="${labels.brand}">
      <img src="/assets/sellf-logo.png" alt="Sellf" width="42" height="58">
      <span class="brand-word">sellf<span class="brand-product">Offerletter</span></span>
    </a>
    <div class="header-controls">
      <nav aria-label="${labels.nav}">
        <a href="${labels.home}">${labels.homeLabel}</a>
        <a href="${labels.contact}">${labels.contactLabel}</a>
        <a href="${labels.ratecard}" aria-current="page">Ratecard</a>
        <a href="${labels.search}">${labels.searchLabel} ↗</a>
      </nav>
      <div class="language-switch" role="group" aria-label="${labels.language}">
        <a href="/ratecard" lang="tr" hreflang="tr"${language === 'tr' ? currentLanguage : ''}>TR</a>
        <span aria-hidden="true">/</span>
        <a href="/en/ratecard" lang="en" hreflang="en"${language === 'en' ? currentLanguage : ''}>EN</a>
      </div>
    </div>
  </header>
  <main id="main">${operations ? renderRates(language, labels, operations) : renderAccess(labels, message)}</main>
  <footer class="site-footer wrap"><div class="footer-links"><a href="${labels.contact}">${labels.contactLabel}</a><span>© ${new Date().getUTCFullYear()} Sellf</span></div></footer>
</body>
</html>`;
}
