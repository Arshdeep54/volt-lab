const day = {
  '--scene-sky-top': '#eef6fa',
  '--scene-sky-bottom': '#f7fafb',
  '--scene-ink': '#203c48',
  '--scene-muted': '#607e87',
  '--scene-dots': '#d7e3e8',
  '--scene-shadow': '#e5edef',
  '--scene-ground': '#ebf1f1',
  '--scene-ground-line': '#dce5e6',
  '--scene-wall-shade': '#d8e4e6',
  '--scene-wall': '#f0f5f5',
  '--scene-window': '#9cbecb',
  '--scene-night-opacity': 0,
};
const dawn = {
  ...day,
  '--scene-sky-top': '#d8e2f2',
  '--scene-sky-bottom': '#ffead5',
  '--scene-ground': '#e8e5df',
  '--scene-shadow': '#d9dce4',
  '--scene-night-opacity': 0.15,
};
const dusk = {
  ...day,
  '--scene-sky-top': '#efc6ab',
  '--scene-sky-bottom': '#fff0d9',
  '--scene-dots': '#ddb9a1',
  '--scene-ground': '#eee1d5',
  '--scene-shadow': '#dfcbbc',
  '--scene-wall': '#f4e9da',
  '--scene-wall-shade': '#d7c7b9',
  '--scene-window': '#edc78b',
  '--scene-night-opacity': 0.2,
};
const night = {
  ...day,
  '--scene-sky-top': '#122735',
  '--scene-sky-bottom': '#284554',
  '--scene-ink': '#edf5fa',
  '--scene-muted': '#bfd0dc',
  '--scene-dots': '#354f61',
  '--scene-shadow': '#1b3342',
  '--scene-ground': '#36505b',
  '--scene-ground-line': '#4c6570',
  '--scene-wall': '#92a9b2',
  '--scene-wall-shade': '#647f8c',
  '--scene-window': '#f4d292',
  '--scene-night-opacity': 1,
};
const channels = (color) =>
  color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : color.match(/\d+/g).map(Number);
export function blendPalettes(from, to, progress) {
  return Object.fromEntries(
    Object.entries(to).map(([key, value]) => {
      if (typeof value === 'number')
        return [key, from[key] + (value - from[key]) * progress];
      const a = channels(from[key]),
        b = channels(value);
      return [
        key,
        'rgb(' +
          a.map((v, i) => Math.round(v + (b[i] - v) * progress)).join(', ') +
          ')',
      ];
    })
  );
}
const stops = [
  [0, night],
  [3, night],
  [7, dawn],
  [10, day],
  [15, day],
  [18, dusk],
  [22, night],
  [24, night],
];
export function scenePalette(hour) {
  const time = ((hour % 24) + 24) % 24;
  const i = stops.findIndex(([at]) => at > time);
  const [start, from] = stops[i - 1],
    [end, to] = stops[i];
  return blendPalettes(from, to, (time - start) / (end - start));
}
