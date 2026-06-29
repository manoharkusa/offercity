// Shared category list — used by the Home filter chips AND the offer-create form,
// so an offer's category always matches a filter chip.
export const OFFER_CATEGORIES = [
  { key: 'Food',          label: 'Food',          icon: '🍽️' },
  { key: 'Fashion',       label: 'Fashion',       icon: '👗' },
  { key: 'Footwear',      label: 'Footwear',      icon: '👟' },
  { key: 'Jewellery',     label: 'Jewellery',     icon: '💍' },
  { key: 'Electronics',   label: 'Electronics',   icon: '📱' },
  { key: 'Mobiles',       label: 'Mobiles',       icon: '📲' },
  { key: 'Beauty',        label: 'Beauty',        icon: '💄' },
  { key: 'Grocery',       label: 'Grocery',       icon: '🛒' },
  { key: 'Bakery',        label: 'Bakery',        icon: '🧁' },
  { key: 'Health',        label: 'Health',        icon: '💊' },
  { key: 'Fitness',       label: 'Fitness',       icon: '🏋️' },
  { key: 'Home & Living', label: 'Home & Living', icon: '🏠' },
  { key: 'Furniture',     label: 'Furniture',     icon: '🛋️' },
  { key: 'Kids & Toys',   label: 'Kids & Toys',   icon: '🧸' },
  { key: 'Automobile',    label: 'Automobile',    icon: '🚗' },
  { key: 'Education',     label: 'Education',     icon: '📚' },
  { key: 'Services',      label: 'Services',      icon: '🛠️' },
  { key: 'Travel',        label: 'Travel',        icon: '✈️' },
  { key: 'Other',         label: 'More',          icon: '🏷️' },
];

// Home filter strip = "All Offers" + every category above.
export const HOME_CATEGORIES = [
  { key: 'All', label: 'All Offers', icon: '🔥' },
  ...OFFER_CATEGORIES,
];
