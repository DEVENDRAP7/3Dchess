/**
 * Two armies, twelve characters. Each entry drives the codex card the player
 * sees when they tap a piece, and names the signature effect that fires when
 * that character moves or takes a life.
 */

export const ARMIES = {
  w: {
    id: 'w',
    name: 'The Dawn Legion',
    realm: 'Solaria',
    motto: 'We rise while the world sleeps.',
    banner: '#e9b949',
  },
  b: {
    id: 'b',
    name: 'The Umbral Court',
    realm: 'Nocturne',
    motto: 'Every light casts us longer.',
    banner: '#a463ff',
  },
};

export const CODEX = {
  w: {
    p: {
      name: 'Sunspear Conscript',
      rank: 'Footsoldier',
      personality: 'Eager, twitchy, desperate to be seen. Never stops shifting his weight.',
      dress: 'Quilted gambeson under a half-plate cuirass, sun-sigil kite shield strapped to the forearm.',
      helm: 'Open-faced kettle helm with a riveted nose guard and a single brass feather.',
      quirk: 'Taps his shield twice before every advance — for luck, he insists.',
      signature: 'Bracing Charge',
      moveStyle: 'A short, nervous hop that kicks up dust.',
    },
    n: {
      name: 'Ser Aurelian',
      rank: 'Gale Rider',
      personality: 'Reckless and theatrical. Believes any problem can be leapt over.',
      dress: 'Fluted gold barding over a warhorse of pale ash, blue caparison snapping behind him.',
      helm: 'Closed great helm crested with a horsehair plume dyed dawn-blue.',
      quirk: 'His mount nods along to conversations it cannot possibly understand.',
      signature: 'Skyward Vault',
      moveStyle: 'Rears, then leaps a full arc and lands in a ring of shockdust.',
    },
    b: {
      name: 'Lumen',
      rank: 'Keeper of First Light',
      personality: 'Serene to the point of unnerving. Speaks in weather forecasts.',
      dress: 'Layered ivory vestments hemmed in gold thread, sleeves far too long to be practical.',
      helm: 'A tall cleft mitre set with a lens of polished sunstone.',
      quirk: 'Feet have not touched the board in eleven years.',
      signature: 'Radiant Glide',
      moveStyle: 'Hovers across the diagonal on a trail of drifting light motes.',
    },
    r: {
      name: 'Bastion Ironhold',
      rank: 'Living Rampart',
      personality: 'Patient as geology. Has said four words this century, all of them "no".',
      dress: 'Mortared sandstone plating, an iron portcullis worn across the chest like a breastplate.',
      helm: 'A crenellated tower crown — an actual battlement, complete with arrow slits.',
      quirk: 'Sparrows nest in his shoulders. He has decided to allow it.',
      signature: 'Siege Advance',
      moveStyle: 'Grinds forward in a straight line, cracking the stone beneath.',
    },
    q: {
      name: 'Queen Solivere',
      rank: 'The Radiant',
      personality: 'Brilliant, impatient, and entirely aware she is the strongest thing here.',
      dress: 'Filigree gold corselet over a gown of liquid daylight, cape trailing to the floor.',
      helm: 'A seven-pointed crown, each spire holding a captured shard of sunrise.',
      quirk: 'The air warms about a degree wherever she stops.',
      signature: 'Solar Sweep',
      moveStyle: 'Glides without stepping, scattering gold sparks in her wake.',
    },
    k: {
      name: 'King Aldric',
      rank: 'The Everdawn',
      personality: 'Old, tired, and unfailingly kind. Remembers the name of every pawn he has lost.',
      dress: 'Heavy ceremonial plate beneath an ermine-trimmed mantle he no longer fills out.',
      helm: 'The Everdawn Crown — a broad gold circlet with a great amber heartstone.',
      quirk: 'Leans on his sceptre more each game.',
      signature: 'Sovereign Step',
      moveStyle: 'One slow, deliberate stride. The whole board waits for it.',
    },
  },
  b: {
    p: {
      name: 'Duskblade Conscript',
      rank: 'Footsoldier',
      personality: 'Quiet, watchful, fatalistic. Signed on for the meals and stayed for the spite.',
      dress: 'Blackened scale over a charcoal wrap, violet sash knotted at the hip.',
      helm: 'A low sallet with a narrow eye-slit that glows faintly from within.',
      quirk: 'Counts the squares between herself and the far rank. Out loud.',
      signature: 'Creeping Advance',
      moveStyle: 'A low, silent step trailing a wisp of shadow.',
    },
    n: {
      name: 'Ser Ravenmane',
      rank: 'Ashen Rider',
      personality: 'Cold, precise, allergic to speeches. Arrives before you hear the hooves.',
      dress: 'Soot-black barding, a mane of tattered crow feathers, crimson caparison.',
      helm: 'A beaked bascinet crested with three iron quills.',
      quirk: 'The horse has never once blinked.',
      signature: 'Shadow Vault',
      moveStyle: 'Leaps the arc in near silence and lands in a burst of ash.',
    },
    b: {
      name: 'Vesper',
      rank: 'Oracle of the Void',
      personality: 'Speaks only in things that have not happened yet. Usually correct.',
      dress: 'Ink-dark robes with a starfield lining, sleeves stitched shut at the wrists.',
      helm: 'A cracked obsidian mitre orbited by a slow, cold witchlight.',
      quirk: 'Casts a shadow in the wrong direction.',
      signature: 'Void Glide',
      moveStyle: 'Slides the diagonal on a ribbon of violet dark.',
    },
    r: {
      name: 'Grimhold Warden',
      rank: 'Living Rampart',
      personality: 'Implacable. Was a fortress before it was a soldier, and it shows.',
      dress: 'Fused obsidian blockwork veined with cooling ember-light.',
      helm: 'A jagged basalt battlement crown with a furnace burning behind the merlons.',
      quirk: 'Rumbles at a pitch you feel in the teeth rather than hear.',
      signature: 'Siege Advance',
      moveStyle: 'Drags forward in a dead-straight line, scorching the tiles.',
    },
    q: {
      name: 'Queen Morrigane',
      rank: 'The Eclipse',
      personality: 'Elegant, ruthless, extremely funny about it. Enjoys the work.',
      dress: 'Black plate cut like couture over a gown of drifting shadow, cape of raven silk.',
      helm: 'A crown of nine dark spires ringed by an eclipse halo.',
      quirk: 'Lamps dim a little when she passes. She has never apologised for it.',
      signature: 'Eclipse Sweep',
      moveStyle: 'Glides on a violet current, scattering cold sparks.',
    },
    k: {
      name: 'King Malakar',
      rank: 'The Nightcrowned',
      personality: 'Proud, brittle, and secretly terrified of the endgame.',
      dress: 'Ancient blackened regalia beneath a mantle of shadow-wolf pelt.',
      helm: 'The Nightcrown — five iron thorns around a heartstone of frozen violet.',
      quirk: 'Grips his sceptre a little tighter every time a piece falls.',
      signature: 'Sovereign Step',
      moveStyle: 'A single heavy stride that pulls the dark along with it.',
    },
  },
};

export function codexFor(color, type) {
  return CODEX[color][type];
}

/** Short flavour line shown in the event ticker when a piece takes another. */
export function captureLine(attacker, victim) {
  const a = codexFor(attacker.color, attacker.type);
  const v = codexFor(victim.color, victim.type);
  return `${a.name} cuts down ${v.name}.`;
}

export function checkLine(color) {
  const king = codexFor(color, 'k');
  return `${king.name} is under threat!`;
}
