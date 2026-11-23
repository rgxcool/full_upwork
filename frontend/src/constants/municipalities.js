/**
 * Kommuner staff can pick for a student (forms, placement wizard).
 * Mirrors backend/src/config/municipalities.js (the database enum) minus the
 * legacy entries "Göteborg" and "Stockholm", which no student form offers.
 * Not derived from the pricing table: a kommun without prices must still be
 * selectable (KCNO has real students but no price row yet).
 */
export const SELECTABLE_MUNICIPALITIES = Object.freeze([
  'Botkyrka',
  'Danderyd',
  'Huddinge',
  'Järfälla',
  'KCNO',
  'Lidingö',
  'Norrtälje',
  'Nykvarn',
  'Privat kunder',
  'Salem',
  'Sigtuna',
  'Sollentuna',
  'Solna',
  'Sundbyberg',
  'Södertälje',
  'Täby',
  'Upplands Bro',
  'Upplands Väsby',
  'Vallentuna',
  'Vaxholm',
  'Växjö',
  'Österåker',
])
