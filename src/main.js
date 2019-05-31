const Apify = require('apify');

const trimFields = (item, fieldsToShow) => {
    if (!fieldsToShow) {
        return item;
    }
    return fieldsToShow.reduce((newItem, field) => {
        newItem[field] = item[field];
        return newItem;
    }, {});
};

const getOutputItem = (item, badFields, index) => {
    const trimmedItem = trimFields(item);
    const updatedItem = badFields.reduce((updItem, field) => {
        updItem[field] = item[field];
        return updItem;
    }, trimmedItem);
    return { ...updatedItem, badFields, DEBUG_itemIndex: index };
};

async function loadResults({ checker, datasetId, callback, batchSize, limit, badItems, badFields }, offset) {
    const newItems = await Apify.client.datasets.getItems({
        datasetId,
        offset,
        limit: batchSize,
    }).then((res) => res.items);

    console.log(`loaded ${newItems.length} items`);

    if (newItems.length === 0) return;
    callback(checker, newItems, badItems, badFields);
    await Apify.setValue('STATE', { offset, badItems, badFields });
    await loadResults({ datasetId, callback, batchSize, limit, badItems, badFields }, offset + batchSize);
}

const iterationFn = (checker, items, badItems, badFields) => {
    items.forEach((item, index) => {
        const itemBadFields = [];
        Object.keys(checker).forEach((key) => {
            const fn = checker[key];
            const isGood = fn(item[key], item);
            if (!isGood) {
                itemBadFields.push(key);
                if (!badFields[key]) badFields[key] = 0;
                badFields[key]++;
            }
        });
        Object.keys(item).forEach((key) => {
            const allowedKeys = Object.keys(checker);
            if (!allowedKeys.includes(key)) {
                itemBadFields.push(key);
                if (!badFields[key]) badFields[key] = 0;
                badFields[key]++;
            }
        });
        if (itemBadFields.length > 0) {
            badItems.push(getOutputItem(item, itemBadFields, index));
        }
    });
};

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('input');
    console.dir(input);

    const { apifyStorageId, recordKey, rawData, functionalChecker, limit, offset = 0, batchSize = 50000 } = input;

    if (!apifyStorageId && !rawData) {
        throw new Error('Input should contain at least one of: "apifyStorageId" or "rawData"!');
    }
    if (apifyStorageId && rawData) {
        throw new Error('Input cannot contain both of: "apifyStorageId" or "rawData"!');
    }
    if (typeof checkFunctions !== 'object') {
        throw new Error('Input has to contain "checkFunctions" object!');
    }
    Object.entries(functionalChecker).forEach(([key, value]) => {
        if (typeof value !== 'function') {
            throw new Error(`checkFunctions.${key} should be a function! Please correct the input!`);
        }
    });

    const state = await Apify.getValue('STATE');
    const badItems = state ? state.badItems : [];
    const badFields = state ? state.badFields : {};

    let datasetInfo;
    let kvStoreData;
    let totalItemCount;
    if (apifyStorageId) {
        datasetInfo = await Apify.client.datasets.getDataset({ datasetId: apifyStorageId })
            .catch(() => console.log('Dataset with "apifyStorageId" was not found, we will try kvStore'));
        if (datasetInfo) {
            totalItemCount = datasetInfo.itemCount;
        } else {
            kvStoreData = await Apify.client.keyValueStores.getDataset({ storeId: apifyStorageId, key: recordKey }).then((res) => res.body)
                .catch(() => console.log('Key-value store with "apifyStorageId" and "recordKey" was not found, please input correct storage ids'));
            if (!Array.isArray(kvStoreData)) {
                throw new Error('Data loaded from key value store must be an array!');
            }
            totalItemCount = kvStoreData.length;
        }
    }
    if (rawData) {
        if (!Array.isArray(rawData)) {
            throw new Error('Raw data must be an array!');
        }
        totalItemCount = rawData.length;
    }


    if (rawData || kvStoreData) {
        iterationFn(functionalChecker, rawData || kvStoreData, badItems, badFields);
    } else if (datasetInfo) {
        await loadResults({
            checker: functionalChecker,
            datasetId: apifyStorageId,
            callback: iterationFn,
            batchSize,
            limit,
        },
        state ? state.offset : offset);
    }

    console.log(`number of bad items: ${badItems.length}`);
    console.dir(badFields);

    await Apify.setValue('OUTPUT', { totalItemCount, badFields, badItems });
});