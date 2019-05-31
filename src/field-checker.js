module.exports.regularCheck = {
    url: (url) => typeof url === 'string' && url.startsWith('http') && !url.includes('?'),
    original_url: (original_url, item) => typeof original_url === 'string' && original_url.startsWith('http') && original_url.length >= item.url.length,
    categories_json: (categories_json) => Array.isArray(categories_json),
    title: (title) => typeof title === 'string' && title.length >= 3,
    designer_name: (designer_name) => typeof designer_name === 'string' || designer_name === null,
    manufacturer: (manufacturer) => typeof manufacturer === 'string' && manufacturer.length > 0,
    itemId: (itemId) => typeof itemId === 'string' && itemId.length >= 4,
    sku: (sku) => typeof sku === 'string' && sku.length >= 4,
    price: (price) => typeof price === 'number',
    sale_price: (sale_price, item) => (typeof sale_price === 'number' || sale_price === null) && sale_price !== item.price,
    source: (source) => typeof source === 'string',
    currency: (currency) => typeof currency === 'string' && currency.length === 3,
    description: (description) => typeof description === 'string' && description.length >= 5,
    mapped_category: (mapped_category) => typeof mapped_category === 'string' && mapped_category !== 'other',
    composition: (composition) => Array.isArray(composition),
    long_description: (long_description) => typeof long_description === 'string' || long_description === null,
    status: (status) => status === undefined,
    images: (images) => Array.isArray(images) && images.length > 0 && typeof images[0] === 'string' && images[0].includes('http'),
    stock_total: (stock_total) => typeof stock_total === 'number',
    variants: (variants) => Array.isArray(variants), // This is not that important now to do deeper check
    color: () => true,
    otherColors: () => true,
    shipFrom: () => true,
};

module.exports.removedCheck = {
    url: (url) => typeof url === 'string' && url.includes('http'),
    title: (title) => typeof title === 'string' && title.length >= 3,
    itemId: (itemId) => typeof itemId === 'string' && itemId.length >= 4,
    source: (source) => typeof source === 'string',
    status: (status) => status === 'REMOVED',
};
