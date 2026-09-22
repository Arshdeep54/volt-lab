export function scene(x) {
  const celestialY = 48 + Math.abs(x.hour - 12) * 9;
  return (
    '<svg viewBox="0 0 550 265" role="img" aria-label="Home energy flow: solar, house, grid, and battery"><title>Home energy flow at ' +
    x.hour +
    ':00</title><defs><mask id="scene-moon"><rect width="550" height="265" fill="white"/><circle cx="449" cy="65" r="13" fill="black"/></mask><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="var(--scene-dots)"/></pattern></defs><rect width="550" height="265" fill="url(#dots)"/><g class="scene-stars" fill="#e4f0f7"><circle cx="169" cy="48" r="1.2"/><circle cx="329" cy="35" r="1"/><circle cx="378" cy="69" r="1.5"/><circle cx="482" cy="103" r="1"/><circle cx="115" cy="79" r="1.4"/><circle cx="221" cy="29" r="1"/><circle cx="497" cy="43" r="1.3"/></g><ellipse cx="277" cy="213" rx="167" ry="28" fill="var(--scene-shadow)"/><path d="M121 167L276 93 425 164 273 240Z" fill="var(--scene-ground)" stroke="var(--scene-ground-line)"/><path d="M166 119L266 67 354 111 254 165Z" fill="#355764"/><path d="M166 119L254 165 254 214 166 168Z" fill="var(--scene-wall-shade)"/><path d="M254 165L354 111 354 162 254 214Z" fill="var(--scene-wall)" stroke="var(--scene-ground-line)"/><path d="M170 117L267 62 359 109 354 116 265 72 173 124Z" fill="#416571"/> <path d="M197 107L246 80 288 101 240 128Z" fill="#264a62" stroke="#769daa"/><path d="M205 103L247 125M218 96L260 118M232 88L274 110M209 113L258 87M224 121L273 94" stroke="#7296a8" stroke-width="1"/><path d="M181 137L205 150 205 174 181 161Z" fill="var(--scene-window)" stroke="#809faa"/><path d="M190 142L190 166M181 149L205 162" stroke="#c8dfe4"/><path d="M282 164L306 151 306 190 282 203Z" fill="#b9cdd1"/><path d="M318 144L339 132 339 153 318 165Z" fill="var(--scene-window)"/><path d="M328 138L328 159M318 154L339 143" stroke="#deebed"/> <path d="M387 154L413 140 432 149 406 164Z" fill="#d2e3de"/><path d="M387 154L406 164 406 205 387 195Z" fill="#98b7ae"/><path d="M406 164L432 149 432 190 406 205Z" fill="#e2eeea" stroke="#adc8bc"/><path d="M412 171L426 163 426 ' +
    (191 - x.soc * 2) +
    ' 412 ' +
    (199 - x.soc * 2) +
    'Z" fill="#168477"/><text x="419" y="220" text-anchor="middle" fill="var(--scene-muted)" font-size="9">BATTERY</text> <path d="M113 98V159M94 115H131M99 99H128M103 116L92 157M123 116L135 157M103 135H124" stroke="#8aa4af" stroke-width="3" fill="none"/><text x="109" y="179" text-anchor="middle" fill="var(--scene-muted)" font-size="9">GRID</text><path d="M116 155L155 177 175 166" stroke="#4e83b3" stroke-width="2" fill="none" class="' +
    (x.grid > 0 ? 'flow-line' : '') +
    '"/><path d="M350 173L373 185 393 175" stroke="#168477" stroke-width="2" fill="none" class="' +
    (x.charge + x.discharge > 0 ? 'flow-line' : '') +
    '"/> <g class="scene-sun" transform="translate(0,' +
    (celestialY - 71) +
    ')"><circle cx="440" cy="71" r="15" fill="#f2c568"/><path d="M440 48V42M440 94V100M417 71H411M463 71H469M423 54L418 49M457 88L462 93M457 54L462 49M423 88L418 93" stroke="#e6b451" stroke-width="2"/></g><g class="scene-moon"><circle cx="442" cy="71" r="15" fill="#d4e2e7" mask="url(#scene-moon)"/>' +
    '</g><path d="M138 210V179M129 190L138 172 147 190Z" fill="#91b3a1"/><path d="M369 215V197M360 203L369 186 378 203Z" fill="#91b3a1"/></svg>'
  );
}
