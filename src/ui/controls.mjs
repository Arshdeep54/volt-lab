import { escapeHtml } from './format.mjs';
export function select(
  id,
  options,
  current,
  { disabled = false, label = id.replace('micro-', 'Microgrid ') } = {}
) {
  return (
    '<select id="' +
    id +
    '" class="select" aria-label="' +
    escapeHtml(label) +
    '" ' +
    (disabled ? 'disabled' : '') +
    '>' +
    options
      .map(
        ([value, text]) =>
          '<option value="' +
          escapeHtml(value) +
          '" ' +
          (value === current ? 'selected' : '') +
          '>' +
          escapeHtml(text) +
          '</option>'
      )
      .join('') +
    '</select>'
  );
}
