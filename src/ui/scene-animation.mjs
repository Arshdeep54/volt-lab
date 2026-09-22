import { scenePalette, blendPalettes } from '../scene-theme.mjs';
let displayedPalette = null;
let sceneFrame = 0;
export function animateScene(hour) {
  cancelAnimationFrame(sceneFrame);
  const node = document.querySelector('.scene');
  if (!node) {
    displayedPalette = null;
    return;
  }
  const target = scenePalette(Number(node.dataset.hour ?? hour % 24));
  const from = displayedPalette || target;
  const paint = (palette) => {
    displayedPalette = palette;
    for (const [key, value] of Object.entries(palette))
      node.style.setProperty(key, value);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paint(target);
    return;
  }
  paint(from);
  const started = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - started) / 700);
    paint(
      blendPalettes(from, target, progress * progress * (3 - 2 * progress))
    );
    if (progress < 1) sceneFrame = requestAnimationFrame(frame);
  };
  sceneFrame = requestAnimationFrame(frame);
}
