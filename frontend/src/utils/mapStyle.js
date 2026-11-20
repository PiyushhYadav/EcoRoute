/**
 * EcoRoute Apple Maps Crisp Minimal Style for MapLibre GL JS
 *
 * Upgraded OpenFreeMap Liberty Vector Style matching studio-grade Apple Maps cartography:
 * - Background/Land: Crisp cool alabaster #F7F8FA
 * - Parks/Forest: Soft muted architectural sage #DCEBD8 (fill-opacity: 0.78)
 * - Water: Clean soft sky-blue #B4DCFA
 * - Major roads: Motorway, trunk, primary crisp #FFFFFF fills with ultra-delicate #E2E8F0 casings
 * - Decluttered: Shield, poi, transit, housenumber, building, street-label, minor roads stripped
 * - Regional labels: Faint (0.45 opacity) high-level region labels (Delhi, Gurugram, Noida, Yamuna) with crisp white halos
 */

const OPENFREEMAP_LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Allowed high-level NCR region labels
const ALLOWED_REGIONS = ['Delhi', 'Gurugram', 'Noida', 'Yamuna'];

// Exclude noisy towns/suburbs to keep focus strictly on high-level NCR regions
const EXCLUDED_TOWNS = [
  'New Delhi',
  'Delhi Cantonment',
  'Cantonment',
  'New Delhi Cantonment',
  'Bahadurgarh',
  'Najafgarh',
  'Loni',
  'Najafgarh Sub-Division',
  'Bahadurgarh Tehsil',
  'Khora',
  'Muradnagar',
  'Modinagar',
  'Dadri',
  'Mandoli',
  'Sultanpur',
  'Faridabad Tehsil',
  'Ballabhgarh',
  'Ghaziabad',
  'Faridabad',
  'Sonipat',
  'Kundli',
  'Manesar',
  'Sohna',
  'Bhiwadi',
];

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
        id.includes('label_other') ||
        id === 'label_state' ||
        id.includes('country')
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

    // Background / Land: Crisp cool alabaster #F7F8FA
    if (type === 'background') {
      layer.paint = {
        ...(layer.paint || {}),
        'background-color': '#F7F8FA',
      };
    }

    // Parks / Forest / Greenery: Soft muted architectural sage #DCEBD8 (fill-opacity: 0.78)
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
          'fill-color': '#DCEBD8',
          'fill-opacity': 0.78,
          'fill-outline-color': '#DCEBD8',
        };
      } else if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#DCEBD8',
          'line-opacity': 0.6,
        };
      }
    }

    // Water / Yamuna River: Clean soft sky-blue #B4DCFA
    if (id.includes('water')) {
      if (type === 'fill') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#B4DCFA',
          'fill-opacity': 0.98,
        };
      } else if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#B4DCFA',
          'line-opacity': 0.85,
        };
      }
    }

    // Major Roads: Motorway, trunk, primary fills in crisp #FFFFFF with ultra-delicate #E2E8F0 casings
    const isCasing = id.includes('casing');
    const isMotorwayOrTrunkOrPrimary =
      id.includes('motorway') || id.includes('trunk') || id.includes('primary');
    const isSecondary = id.includes('secondary');

    if (isMotorwayOrTrunkOrPrimary) {
      if (type === 'line') {
        if (isCasing) {
          layer.paint = {
            ...(layer.paint || {}),
            'line-color': '#E2E8F0',
            'line-opacity': 0.95,
            'line-width': 3.4,
          };
        } else {
          layer.paint = {
            ...(layer.paint || {}),
            'line-color': '#FFFFFF',
            'line-opacity': 1.0,
            'line-width': 2.2,
          };
        }
      }
    } else if (isSecondary) {
      if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#F1F5F9',
          'line-opacity': 0.75,
          'line-width': 1.2,
        };
      }
    }

    // Subtle administrative boundaries
    if (id.includes('boundary')) {
      if (type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#E2E8F0',
          'line-opacity': 0.35,
          'line-width': 1.0,
        };
      }
    }

    // City and Water labels: Faint (0.45 opacity) high-level region labels (Delhi, Gurugram, Noida, Yamuna) with crisp white halos
    if (type === 'symbol') {
      const isWaterSymbol = id.includes('water');
      const isCitySymbol = id.includes('city');

      if (layer.layout) {
        // Strip sprite icons from city symbols
        if (layer.layout['icon-image']) {
          layer.layout = { ...layer.layout, 'icon-image': '' };
        }
        // Simplify text-field to latin / en single line
        layer.layout = {
          ...layer.layout,
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
        };
      }

      // Filter out noisy peripheral towns in city layers; keep only allowed regional labels
      if (isCitySymbol) {
        const nameExpr = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
        layer.filter = [
          'all',
          ...(layer.filter ? [layer.filter] : []),
          ['!', ['in', nameExpr, ['literal', EXCLUDED_TOWNS]]],
          ['in', nameExpr, ['literal', ALLOWED_REGIONS]],
        ];
      }

      layer.paint = {
        ...(layer.paint || {}),
        'text-color': isWaterSymbol ? '#2563EB' : '#334155',
        'text-opacity': 0.45,
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2.0,
        'text-halo-blur': 0.5,
      };
    }

    // Landuse fills restyled to blend cleanly into cool alabaster #F7F8FA
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
          'fill-color': '#F7F8FA',
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
                'background-color': '#F7F8FA',
              },
            },
            {
              id: 'water',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'water',
              paint: {
                'fill-color': '#B4DCFA',
                'fill-opacity': 0.98,
              },
            },
            {
              id: 'park',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'park',
              paint: {
                'fill-color': '#DCEBD8',
                'fill-opacity': 0.78,
              },
            },
            {
              id: 'road_casing',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
              paint: {
                'line-color': '#E2E8F0',
                'line-opacity': 0.95,
                'line-width': 3.4,
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
                'line-color': '#F1F5F9',
                'line-opacity': 0.75,
                'line-width': 1.2,
              },
            },
            {
              id: 'city_labels',
              type: 'symbol',
              source: 'openmaptiles',
              'source-layer': 'place',
              filter: [
                'all',
                ['in', 'class', 'city'],
                ['in', 'name:latin', 'Delhi', 'Gurugram', 'Noida'],
              ],
              layout: {
                'text-field': '{name:latin}',
                'text-font': ['Noto Sans Regular'],
                'text-size': 12,
              },
              paint: {
                'text-color': '#334155',
                'text-opacity': 0.45,
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 2.0,
                'text-halo-blur': 0.5,
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
