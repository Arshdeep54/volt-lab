export function chart(
  series,
  {
    width = 520,
    height = 224,
    xlabel = 'Training episode',
    ylabel = 'Return ($ / week)',
    minY,
    maxY,
    maxX = 1200,
  } = {}
) {
  const left = 54,
    right = 14,
    top = 20,
    bottom = 42,
    w = width - left - right,
    h = height - top - bottom;
  const values = series.flatMap((s) => s.values.map((v) => v.y));
  let lo = minY ?? Math.min(...values),
    hi = maxY ?? Math.max(...values);
  if (!Number.isFinite(lo)) {
    lo = -100;
    hi = 0;
  }
  if (hi === lo) hi = lo + 1;
  if (minY === undefined) {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const xs = series.flatMap((s) => s.values.map((v) => v.x));
  const xmin = xs.length ? Math.min(...xs) : 0,
    xmax = xs.length ? Math.max(Math.max(...xs), xmin + 1) : maxX;
  const x = (v) => left + ((v - xmin) / (xmax - xmin || 1)) * w,
    y = (v) => top + ((hi - v) / (hi - lo)) * h;
  let svg =
    '<svg viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" role="img" aria-label="' +
    ylabel +
    ' by ' +
    xlabel +
    '"><title>' +
    ylabel +
    ' by ' +
    xlabel +
    '</title>';
  for (let i = 0; i < 4; i++) {
    const yy = top + (h * i) / 3;
    svg +=
      '<line x1="' +
      left +
      '" y1="' +
      yy +
      '" x2="' +
      (width - right) +
      '" y2="' +
      yy +
      '" stroke="#e6edef"/><text x="' +
      (left - 8) +
      '" y="' +
      (yy + 3) +
      '" text-anchor="end" fill="#81959c" font-size="9">' +
      (hi - ((hi - lo) * i) / 3).toFixed(0) +
      '</text>';
  }
  for (let i = 0; i < 5; i++) {
    const v = xmin + ((xmax - xmin) * i) / 4;
    svg +=
      '<text x="' +
      x(v) +
      '" y="' +
      (height - 23) +
      '" text-anchor="middle" fill="#81959c" font-size="9">' +
      Math.round(v) +
      '</text>';
  }
  for (const s of series) {
    if (s.values.length === 1) {
      svg +=
        '<circle cx="' +
        x(s.values[0].x) +
        '" cy="' +
        y(s.values[0].y) +
        '" r="3" fill="' +
        s.color +
        '"/>';
    }
    const points = s.values.map((v) => x(v.x) + ',' + y(v.y)).join(' ');
    svg +=
      '<polyline points="' +
      points +
      '" fill="none" stroke="' +
      s.color +
      '" stroke-width="2" stroke-linejoin="round"/>';
  }
  return (
    svg +
    '<text x="' +
    (left + w / 2) +
    '" y="' +
    (height - 6) +
    '" text-anchor="middle" fill="#81959c" font-size="9">' +
    xlabel +
    '</text><text transform="translate(12,' +
    (top + h / 2) +
    ') rotate(-90)" text-anchor="middle" fill="#81959c" font-size="9">' +
    ylabel +
    '</text></svg>'
  );
}
