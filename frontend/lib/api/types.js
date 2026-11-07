/**
 * JSDoc-Typen der API (gespiegelt aus docs/api/openapi.yaml bzw. backend/app/schemas.py).
 * Reine Typdatei – exportiert zur Laufzeit nichts.
 */

/** @typedef {'example'|'verified'} DataStatus */
/** @typedef {'residential'|'public'|'commercial'|'agricultural'} BuildingCategory */
/** @typedef {1|2|3|6} SuitabilityClass */
/** @typedef {'gable'|'flat'|'shed'|'other'} RoofType */
/** @typedef {'potential'|'existing'} PvView */

/** @typedef {{value: string|number, label: string}} LabeledOption */
/** @typedef {{min: number, max: number, step: number, default: number}} Range */

/**
 * @typedef {Object} Meta
 * @property {DataStatus} data_status
 * @property {LabeledOption[]} categories
 * @property {LabeledOption[]} suitability_classes
 * @property {LabeledOption[]} roof_types
 * @property {LabeledOption[]} pv_views
 * @property {LabeledOption[]} postal_codes
 * @property {{target_utilization_pct: Range, horizon_years: Range, electricity_price_ct_per_kwh: Range}} sliders
 * @property {{value_ct_per_kwh: number, source: string, is_example: boolean}} electricity_price
 * @property {{name: string, url: string, retrieved_at?: string}[]} sources
 * @property {string} data_as_of
 */

/**
 * @typedef {Object} Status
 * @property {number} installed_power_mwp
 * @property {number} potential_power_mwp
 * @property {number} utilization_pct
 * @property {number} installation_count
 * @property {string} source
 * @property {DataStatus} data_status
 * @property {string} data_as_of
 */

/**
 * @typedef {Object} MapFilters
 * @property {string} [bbox]  "minLon,minLat,maxLon,maxLat"
 * @property {string} [postal_code]
 * @property {BuildingCategory[]} [category]
 * @property {SuitabilityClass[]} [suitability]
 */

/** @typedef {{postal_code: string, name?: string, installed_power_mwp: number, potential_power_mwp: number, utilization_pct: number, label_point?: [number, number]}} PostalAreaProps */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: any, properties: PostalAreaProps}[]}} PostalAreaCollection */

/**
 * @typedef {Object} BuildingProps
 * @property {BuildingCategory} category
 * @property {SuitabilityClass} suitability
 * @property {RoofType} roof_type
 * @property {number} [roof_area_m2]
 * @property {number} potential_kwp
 * @property {number} [potential_yield_kwh_per_year]
 * @property {number} installed_kwp  0 = freies Potenzial
 * @property {string} postal_code
 */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: any, properties: BuildingProps}[]}} BuildingCollection */

/** @typedef {{power_kwp: number, commissioned_on?: string|null, postal_code: string, category?: BuildingCategory}} InstallationProps */
/** @typedef {{type: 'FeatureCollection', features: {type: 'Feature', id: string, geometry: {type: 'Point', coordinates: [number, number]}, properties: InstallationProps}[]}} InstallationCollection */

/** @typedef {{key: string, label: string, building_count: number, potential_kwp: number, share_pct: number}} BreakdownItem */
/** @typedef {{basis: 'count', data_status: DataStatus, items: BreakdownItem[]}} Breakdown */

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
