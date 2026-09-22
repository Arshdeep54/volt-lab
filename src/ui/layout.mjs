export function heading(eyebrow, title, description, actions = '') {
  return (
    '<div class="page-heading"><div><div class="eyebrow">' +
    eyebrow +
    '</div><h1>' +
    title +
    '</h1><p>' +
    description +
    '</p></div><div class="actions">' +
    actions +
    '</div></div>'
  );
}
