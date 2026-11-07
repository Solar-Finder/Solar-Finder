/**
 * JSDoc-Typen der API (gespiegelt aus docs/api/openapi.json bzw. backend/app/schemas.py).
 * Reine Typdatei – exportiert zur Laufzeit nichts.
 */

/** @typedef {'verified'|'estimated'|'example'|'pending'} DataStatus */
/** @typedef {'residential'|'public'|'commercial'|'agricultural'|'other'} BuildingCategory */
/** @typedef {1|2|3|6} SuitabilityClass  folgt mit den LUBW-Daten */
/** @typedef {'gable'|'flat'|'shed'|'other'} RoofType */
/** @typedef {'potential'|'existing'} PvView */
/** @typedef {'existing'|'potential'|'none'} SolarStatus */

/** @typedef {{value: string|number, label: string}} LabeledOption */
/** @typedef {{min: number, max: number, step: number, default: number}} Range */

/**
 * @typedef {Object} Meta
 * @property {DataStatus} installed_status   MaStR → verified
 * @property {DataStatus} potential_status   estimated bis LUBW-Daten vorliegen
 * @property {DataStatus} suitability_status pending bis LUBW-Daten vorliegen
 * @property {LabeledOption[]} categories
 * @property {LabeledOption[]} suitability_classes
 * @property {LabeledOption[]} roof_types
 * @property {LabeledOption[]} pv_views
 * @property {LabeledOption[]} postal_codes
 * @property {{target_utilization_pct: Range, horizon_years: Range, electricity_price_ct_per_kwh: Range}} sliders
 * @property {{value_ct_per_kwh: number, source: string, is_example: boolean}} electricity_price
 * @property {{name: string, url: string, retrieved_at?: string, note?: string}[]} sources
 * @property {string} data_as_of
 */

/**
 * @typedef {Object} Status
 * @property {number} installed_power_mwp
 * @property {number} potential_power_mwp
 * @property {number} utilization_pct
 * @property {number} installation_count          alle registrierten Anlagen
 * @property {number} located_installation_count  davon mit Koordinaten (> 30 kW)
 * @property {number} balcony_count
 * @property {DataStatus} installed_status
 * @property {DataStatus} potential_status
 * @property {string} source
 * @property {string} data_as_of
 */

/**
 * @typedef {Object} MapFilters
 * @property {string} [bbox]  "minLon,minLat,maxLon,maxLat"
 * @property {string} [postal_code]
 * @property {BuildingCategory[]} [category]
 * @property {SuitabilityClass[]} [suitability]
 */

/**
 * @typedef {Object} PostalAreaProps
 * @property {string} postal_code
 * @property {string} [name]
 * @property {number} installed_power_mwp
 * @property {number} potential_power_mwp
 * @property {number} utilization_pct
 * @property {number} installation_count
 * @property {number} located_installation_count
 * @property {number} balcony_count
 * @property {number} buildings_with_solar
 * @property {number} buildings_with_potential
 * @property {[number, number]} [label_point]
 */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: any, properties: PostalAreaProps}[], potential_status: DataStatus}} PostalAreaCollection */

/**
 * @typedef {Object} BuildingProps
 * @property {BuildingCategory} category
 * @property {string} building_type   OSM-Gebäudetyp
 * @property {string|null} [name]
 * @property {number} footprint_m2
 * @property {SolarStatus} solar_status
 * @property {number} installed_kwp   Summe zugeordneter MaStR-Anlagen
 * @property {('mastr'|'osm')[]} solar_sources
 * @property {number} potential_kwp
 * @property {DataStatus} potential_status
 * @property {SuitabilityClass|null} [suitability]
 * @property {RoofType|null} [roof_type]
 * @property {string|null} [postal_code]
 */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: any, properties: BuildingProps}[], truncated: boolean}} BuildingCollection */

/**
 * @typedef {Object} InstallationProps
 * @property {number} power_kwp
 * @property {string|null} [commissioned_on]
 * @property {string|null} [postal_code]
 * @property {string|null} [street]
 * @property {string|null} [house_number]
 * @property {string|null} [plant_type]
 * @property {string|null} [building_use]
 * @property {string|null} [building_id]
 */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: {type: 'Point', coordinates: [number, number]}, properties: InstallationProps}[], unlocated_count: number}} InstallationCollection */

/** @typedef {{key: string, label: string, building_count: number, potential_kwp: number, share_pct: number}} BreakdownItem */
/** @typedef {{basis: 'count', data_status: DataStatus, note?: string|null, items: BreakdownItem[]}} Breakdown */

/**
 * @typedef {Object} ForecastRequest
 * @property {number} target_utilization_pct  0–100
 * @property {number} horizon_years  1–30
 * @property {number} electricity_price_ct_per_kwh
 */

/**
 * @typedef {Object} ForecastResponse  Werte beziehen sich auf den zusätzlichen Ausbau
 * @property {DataStatus} data_status
 * @property {number} existing_power_mwp
 * @property {number} potential_power_mwp
 * @property {number} target_power_mwp
 * @property {number} new_power_mwp
 * @property {number} investment_eur
 * @property {number} profit_eur
 * @property {number} electricity_value_eur_per_year
 * @property {number} operating_cost_eur_per_year
 * @property {number|null} amortization_years
 * @property {number} energy_per_year_mwh
 * @property {number} energy_total_mwh
 * @property {number} consumption_gwh_per_year
 * @property {number} solar_share_pct
 * @property {number} co2_savings_t_per_year
 * @property {number} co2_savings_t_total
 * @property {{investment_eur_per_kwp: number, specific_yield_kwh_per_kwp: number, operating_cost_pct_of_investment: number, co2_kg_per_kwh: number}} assumptions
 * @property {{year_index: number, year: number, cumulative_balance_eur: number}[]} timeline
 */

export {};
