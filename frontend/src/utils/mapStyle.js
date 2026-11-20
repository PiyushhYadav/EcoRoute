/**
 * EcoRoute Apple Maps Crisp Minimal Style for MapLibre GL JS
 *
 * Upgraded OpenFreeMap Liberty Vector Style matching studio-grade Apple Maps cartography:
 * - Background/Land: Crisp cool alabaster #F5F7FA
 * - Parks/Forest: Fresh soft sage-mint #D8EEDB (fill-opacity: 0.82)
 * - Water: Luminous crisp sky-blue #A7D7FA with #8BC8F5 waterway lines
 * - Roads: Crisp #FFFFFF motorway/trunk/primary fills with subtle cool-gray casings (#DCE3EC)
 * - Decluttered: Town/village/suburb/neighbourhood/poi/shield/street labels stripped
 * - Retains: Low-opacity (0.55) top-level city and water labels with crisp white halos
 */

const OPENFREEMAP_LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Transforms an OpenFreeMap Liberty style into the Apple Maps crisp minimal design.
 */
export function restyleLibertyStyle(rawStyle) {
  const cloned = JSON.parse(JSON.stringify(rawStyle));

  // Remove shaded relief raster source if present
  if (cloned.sources && cloned.sources.ne2_shaded) {
    delete cloned.sources.ne2_shaded;
  }

  const shouldRemoveLayer = (layer) => {
    const id = (layer.id || '').toLowerCase();
    const sl = (layer['source-layer'] || '').toLowerCase();

    // 1. Remove POIs, shields, transit, aerodromes, housenumbers, buildings
    if (
      id.includes('shield') ||
      id.startsWith('poi') ||
      id.includes('poi_') ||
      id.includes('transit') ||
      id.includes('housenumber') ||
      id.includes('aerodrome') ||
      id.includes('building') ||
      id.includes('aeroway') ||
      id.includes('airport')
    ) {
      return true;
    }

    // 2. Remove street names, minor roads, towns, villages, suburbs, neighbourhoods, hamlets
    if (layer.type === 'symbol') {
      if (
        id.includes('highway-name') ||
        id.includes('road-name') ||
        id.includes('street') ||
        id.includes('one_way') ||
        id.includes('arrow') ||
        sl === 'transportation_name'
      ) {
        return true;
      }
      if (
        id.includes('place_town') ||
        id.includes('label_town') ||
        id.includes('place_village') ||
        id.includes('label_village') ||
        id.includes('place_suburb') ||
        id.includes('suburb') ||
        id.includes('place_neighbourhood') ||
        id.includes('neighbourhood') ||
        id.includes('neighborhood') ||
        id.includes('place_hamlet') ||
        id.includes('hamlet') ||
        id === 'label_other' ||
        id === 'label_state'
      ) {
        return true;
      }
      const isCity = id.includes('city');
      const isWater = id.includes('water');
      if (!isCity && !isWater) {
        return true;
      }
    }

    // 3. Remove minor roads, paths, service, tracks, rails, pedestrian
    if (
      id.includes('minor') ||
      id.includes('path') ||
      id.includes('service') ||
      id.includes('track') ||
      id.includes('rail') ||
      id.includes('pedestrian') ||
      id.includes('area_pattern') ||
      id.includes('street') ||
      id.includes('link') ||
      id === 'natural_earth'
    ) {
      return true;
    }

    // 4. Remove casings except for motorway, trunk, and primary
    if (id.includes('casing')) {
      const isMajorCasing =
        id.includes('motorway') || id.includes('trunk') || id.includes('primary');
      if (!isMajorCasing) {
        return true;
      }
    }

    return false;
  };

  cloned.layers = (cloned.layers || []).filter((l) => !shouldRemoveLayer(l));

  // Restyle kept layers
  cloned.layers.forEach((layer) => {
    const id = (layer.id || '').toLowerCase();
    const type = layer.type;

    // Background / Land: Clean cool alabaster #F5F7FA
    if (type === 'background') {
      layer.paint = {
        ...(layer.paint || {}),
        'background-color': '#F5F7FA',
      };
    }

    // Parks / Forest / Grass: Fresh soft sage-mint #D8EEDB (fill-opacity: 0.82)
    if (
      id.includes('park') ||
      id.includes('wood') ||
      id.includes('forest') ||
      id.includes('grass') ||
      id.includes('wetland') ||
      id.includes('cemetery') ||
      id.includes('pitch') ||
      id.includes('garden')
    ) {
      if (type === 'fill') {
        const paint = { ...(layer.paint || {}) };
        delete paint['fill-pattern']; // avoid missing pattern sprite warnings
        layer.paint = {
          ...paint,
          'fill-color': '#D8EEDB',
          'fill-opacity': 0.82,
          'fill-outline-color': '#D8EEDB',
        };
      } else if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#D8EEDB',
          'line-opacity': 0.6,
        };
      }
    }

    // Water / Yamuna River: Luminous crisp sky-blue #A7D7FA with subtle #8BC8F5 lines
    if (id.includes('water')) {
      if (type === 'fill') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#A7D7FA',
          'fill-opacity': 0.98,
        };
      } else if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#8BC8F5',
          'line-opacity': 0.85,
        };
      }
    }

    // Roads (Apple Maps Look):
    // Motorway, trunk, and primary fills in crisp #FFFFFF with cool-gray casings (#DCE3EC)
    // Secondary roads subtle #EDF1F5
    const isCasing = id.includes('casing');
    const isMotorwayOrTrunkOrPrimary =
      id.includes('motorway') || id.includes('trunk') || id.includes('primary');
    const isSecondary = id.includes('secondary');

    if (isMotorwayOrTrunkOrPrimary) {
      if (type === 'line') {
        if (isCasing) {
          layer.paint = {
            ...(layer.paint || {}),
            'line-color': '#DCE3EC',
            'line-opacity': 0.92,
          };
        } else {
          layer.paint = {
            ...(layer.paint || {}),
            'line-color': '#FFFFFF',
            'line-opacity': 1.0,
          };
        }
      }
    } else if (isSecondary) {
      if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#EDF1F5',
          'line-opacity': 0.85,
        };
      }
    }

    // Subtle administrative boundaries
    if (id.includes('boundary')) {
      if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#DCE3EC',
          'line-opacity': 0.35,
          'line-width': 1.0,
        };
      }
    }

    // Minimal, low-opacity (0.55) top-level city/water labels (Delhi, Gurugram, Noida, Yamuna) with crisp white halos
    if (type === 'symbol') {
      layer.paint = {
        ...(layer.paint || {}),
        'text-color': '#475569',
        'text-opacity': 0.55,
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2.0,
        'text-halo-blur': 0.5,
      };
    }

    // Landuse fills restyled to blend cleanly into cool alabaster #F5F7FA
    if (
      id.includes('residential') ||
      id.includes('hospital') ||
      id.includes('school') ||
      id.includes('sand') ||
      id.includes('commercial') ||
      id.includes('industrial') ||
      id.includes('landuse') ||
      id.includes('landcover')
    ) {
      if (type === 'fill') {
        const paint = { ...(layer.paint || {}) };
        delete paint['fill-pattern'];
        layer.paint = {
          ...paint,
          'fill-color': '#F5F7FA',
          'fill-opacity': 1.0,
        };
      }
    }
  });

  return cloned;
}

let cachedStylePromise = null;
let cachedStyleResult = null;

/**
 * Fetches and caches OpenFreeMap Liberty style, programmatically restyling its layers.
 */
export async function getMutedMapStyle() {
  if (cachedStyleResult) {
    return JSON.parse(JSON.stringify(cachedStyleResult));
  }

  if (!cachedStylePromise) {
    cachedStylePromise = (async () => {
      try {
        const response = await fetch(OPENFREEMAP_LIBERTY_URL);
        if (!response.ok) {
          throw new Error(`Failed to fetch Liberty style: HTTP ${response.status}`);
        }
        const rawJson = await response.json();
        const cleaned = restyleLibertyStyle(rawJson);
        cachedStyleResult = cleaned;
        return cleaned;
      } catch (err) {
        console.warn('Could not fetch remote Liberty vector style, using built-in vector schema:', err);
        // Fallback minimal vector style pointing directly to OpenFreeMap vector tiles
        const fallback = {
          version: 8,
          name: 'EcoRoute Apple Crisp Fallback',
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
          sources: {
            openmaptiles: {
              type: 'vector',
              url: 'https://tiles.openfreemap.org/planet',
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': '#F5F7FA',
              },
            },
            {
              id: 'water',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'water',
              paint: {
                'fill-color': '#A7D7FA',
                'fill-opacity': 0.98,
              },
            },
            {
              id: 'park',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'park',
              paint: {
                'fill-color': '#D8EEDB',
                'fill-opacity': 0.82,
              },
            },
            {
              id: 'road_casing',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
              paint: {
                'line-color': '#DCE3EC',
                'line-opacity': 0.92,
                'line-width': 3.6,
              },
            },
            {
              id: 'road_major',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
              paint: {
                'line-color': '#FFFFFF',
                'line-opacity': 1.0,
                'line-width': 2.2,
              },
            },
            {
              id: 'road_secondary',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              filter: ['==', 'class', 'secondary'],
              paint: {
                'line-color': '#EDF1F5',
                'line-opacity': 0.85,
                'line-width': 1.4,
              },
            },
          ],
        };
        cachedStyleResult = fallback;
        return fallback;
      }
    })();
  }

  const result = await cachedStylePromise;
  return JSON.parse(JSON.stringify(result));
}

export default getMutedMapStyle;
