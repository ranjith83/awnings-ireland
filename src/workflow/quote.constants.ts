export const QUOTE_VAT_RATE          = 13.5;
export const QUOTE_ELECTRICIAN_PRICE = 280.00;
export const QUOTE_BRACKET_ID_OFFSET = 200000;

export const ADDON_SLOT = {
  BRACKET:      'bracket',
  ARM:          'arm',
  MOTOR:        'motor',
  HEATER:       'heater',
  ELECTRICIAN:  'electrician',
  INSTALLATION: 'installation',
  RAL:          'ral',
  SHADEPLUS:    'shadeplus',
  VALANCE:      'valance',
  WALLSEALING:  'wallsealing',
  LIGHTING:     'lighting',
  CONTROL:      'control',
  FRAMECOLOUR:  'framecolour',
} as const;

export type AddonSlot = typeof ADDON_SLOT[keyof typeof ADDON_SLOT];

export const ADDON_ITEM_IDS: Record<AddonSlot, number> = {
  bracket:      100001,
  arm:          100002,
  motor:        100003,
  heater:       100004,
  electrician:  100005,
  installation: 100006,
  ral:          100007,
  shadeplus:    100008,
  valance:      100009,
  wallsealing:  100010,
  lighting:     100011,
  control:      100012,
  framecolour:  100013,
};

export const ADDON_SLOT_ORDER: AddonSlot[] = [
  ADDON_SLOT.BRACKET, ADDON_SLOT.ARM,          ADDON_SLOT.MOTOR,      ADDON_SLOT.HEATER,
  ADDON_SLOT.ELECTRICIAN, ADDON_SLOT.INSTALLATION, ADDON_SLOT.RAL,   ADDON_SLOT.SHADEPLUS,
  ADDON_SLOT.VALANCE, ADDON_SLOT.WALLSEALING,  ADDON_SLOT.LIGHTING,   ADDON_SLOT.CONTROL,
  ADDON_SLOT.FRAMECOLOUR,
];
