## Results Checker

- [Overview](#overview)
- [How it works](#how-it-works)
- [Usage](#usage)
- [Input](#input)
- [Functional checker](#functional-checker)
- [JSON Schema checker](#json-schema-checker)
- [Reports](#reports)
- [Epilogue](#epilogue)

### Overview
Results Checker is an [Apify actor](https://apify.com/actors) that helps you find inconsistencies in your output and essentially fix bugs. 

- Loads data from Apify [Dataset](https://apify.com/docs/storage#dataset), [Key Value store](https://apify.com/docs/storage#key-value-store) or just as an arbitrary JSON and runs a check on each item. 
- The check takes seconds to a maximum of a few minutes for larger datasets.
- Produces a report so you know exactly how many problems are there and which items contained them. 
- It is very useful to append this actor as a [webhook](https://apify.com/docs/webhooks) and you can easily chain another actor after that to [send an email](https://apify.com/apify/send-mail) or [add a report to your Google Sheets](https://apify.com/lukaskrivka/google-sheets) to name just a few examples. Check [Apify Store](https://apify.com/store) for more.

### How it works

- Loads data in batches into memory (Key Value store or raw data are loaded all at once).
- Each item in the batch is scanned.
- Each field is checked with a [predicate](https://www.youtube.com/watch?v=zP6X8QVcHWE). Extra fields are considered bad (the whole item is marked bad).
- A [report](#reports) is created from the whole batch.
- Between each batch, the state of the actor is saved so it doesn't have to repeat itself on restart(migration).
- In the end, the report from all batches is merged together and saved as `OUTPUT` to the default Key Value store.

### Usage
- For smaller datasets you can use 128 MB memory but if it fails with an 137 error code (out of memory), you will need to increase it. Add more memory for increased speed. Maximum effective memory is usually about 4 GB since the checker can use just one CPU core.
- If the report would be too big to be saved or opened, just run a few smaller runs of this actor using `limit` and `offset` parameters.

#### Compute units (CU) consumption examples (complex check & large items)
- 10,000 items - 0.005 CU (few seconds)
- 100,000 items - 0.05 (one minute, computation is instant but loading items take time)
- 1,000,000 items - 2 CU (requires up to 16 GB memory to hold data, better to split into smaller runs - this may get fixed in future version)

### Input
This actor expects a JSON object as an input. You can also set it up in a visual UI on Apify. You can find examples in the Input and Example Run tabs of the actor page in Apify Store.

- `apifyStorageId` <[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)> Apify ID of the storage where the data are located. Can be ID of a dataset or key-value store or crawler execution. Key-value-store requires to set also a `recordKey` **You have specify this or `rawData` but not both**
- `recordKey` <[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)> Record key from where it loads data in key value store. **Only allowed when `apifyStorageId` points to a key value store**
- `rawData` <[array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)> Array of objects to be checked. **You have specify this or `apifyStorageId` but not both**.
- `functionalChecker` <[stringified function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)> Stringified javascipt function returns an object with item fields as keys and values as predicates (functions that return true/false). Check [Function Checker](#functional-checker) section. **Required**
- `identificationFields` <[array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)> Array of fields(strings) that will be shown for the bad items in the OUTPUT report. Useful for identification (usually URL, itemId, color etc.).
`limit`: <[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type)> How many items will be checked. **Default: all**
`offset`: <[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type)> From which item the checking will start. Use with `limit` to check specific items. **Default: 0**
`batchSize`: <[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type)> You can change number of loaded and processed items in each batch. This is only needed to be changed if you have really huge items. **Default: 50000**

### Functional checker
A checker that uses functions allows us to write custom and flexible checks in plain javascript. Let's look first on some examples of the checker.

**Very simple:**
This checker ensures the `url` is in the correct format most of the time. It also allows an optional color field. All other extra fields will be marked bad.
```
() => ({
    url: (url) => typeof url === 'string' && url.startsWith('http') && url.length > 10,
    color: (field) => true // optional field
})
```

You can see the name of the parameter doesn't matter as it is just a regular javascript function. The object key as `url` and `color` in this example needs to match exactly.

**Medium complexity**
Checks more fields.
```
() => ({
    url: (url) => typeof url === 'string' && url.startsWith('http') && url.length > 10,
    title: (title) => typeof title === 'string' && title.length >= 3,
    itemId: (itemId) => typeof itemId === 'string' && itemId.length >= 4,
    source: (source) => typeof source === 'string',
    status: (status) => status === 'NEW',
})
```

**Complex**
```
() => ({
    url: (url) => typeof url === 'string' && url.startsWith('http') && url.length > 10 && !url.includes('?'),
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
    images: (images) => Array.isArray(images) && typeof images[0] === 'string' && images[0].includes('http'),
    stock_total: (stock_total) => typeof stock_total === 'number',
    variants: (variants) => Array.isArray(variants), // This is not that important now to do deeper check
    color: () => true,
    otherColors: () => true,
    shipFrom: () => true,
})
```

Let's look at some advanced checks we did here:
- You can pass a second parameter `item` to the predicate (checking function) so that you can always have a reference to all other fields. In this case, we first checked that `price` is a number. Then `salePrice` can be either `number` or `null` but cannot equal to `price` so it only shows up if there is a real discount, otherwise, it should stay `null`.
```
price: (price) => typeof price === 'number',
sale_price: (sale_price, item) => (typeof sale_price === 'number' || sale_price === null) && sale_price !== item.price,
```
- If the predicate always returns `true`, it means this field can have any value, even `undefined` so it can be absent and still pass too.

**Important:** You should always define your predicates in a way that cannot crash. For example `(images) => images[0].includes('http')` has ways to crash. The correct definition is `(images) => Array.isArray(images) && typeof images[0] === 'string' && images[0].includes('http')`. An error occuring in the predicate will crash the whole actor because the check cannot be valid any more. If it happens, the problematic item will be logged so you can correct the check.

### JSON Schema Checker

*To be added in the next version*

### Reports
At the end of the actor run, the report is saved to the default Key Value store as an `OUTPUT`. 

It contains:
- `totalItemCount`, `badItemCount`, `identificationFields`
- `badFields` array that shows how many times each field was bad. This way you instantly see your problematic spots.
- `badItems` array of all bad items. The `data` diplay their content whole or just with `identificationFields` plus bad fields to shorten the length. Also for each bad item, you will see exactly the `badFields` (that didn't match the predicate or were extra) and `itemIndex` to locate your item in the dataset.

```
{
  "totalItemCount": 41117,
  "badItemCount": 63,
  "identificationFields: ["url"],
  "badFields": {
    "sku": 63,
    "price": 63,
    "status": 63,
    "images": 63,
    "title": 2,
    "itemId": 2
  },
  "badItems": [
    {
      "data": {
        "url": "https://en-ae.namshi.com/buy-trendyol-puff-sleeve-sheer-detail-dress-cd1088znaa8k.html"
      },
      "badFields": [
        "sku",
        "price",
        "status",
        "images"
      ],
      "itemIndex": 4
    },
    ... // other items here
  ]
}
```

### Epilogue
If you find any problem or would like to add a new feature, please create an issue on the Github page.

Thanks everybody for using it and feedback!