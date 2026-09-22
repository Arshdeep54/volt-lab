export const money = (value) => '$' + value.toFixed(2);
export const number = (value) => value.toLocaleString('en-US');
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  );
