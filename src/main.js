const Apify = require('apify');
// const deepcopy = require('deepcopy');

// let COPY_MODE;

const trimFields = (item, identificationFields) => {
    if (identificationFields.length === 0) {
        return item;
    }
    return identificationFields.reduce((newItem, field) => {
        newItem[field] = item[field];
        return newItem;
    }, {});
};

const getOutputItem = (item, badFields, identificationFields, index) => {
    const trimmedItem = trimFields(item, identificationFields);
    const updatedItem = badFields.reduce((updItem, field) => {
        updItem[field] = item[field];
        return updItem;
    }, trimmedItem);
    return { data: updatedItem, badFields, itemIndex: index };
};

async function loadResults(options, offset) {
    const { checker, datasetId, callback, batchSize, limit, badItems, badFields, identificationFields } = options;
    console.log(`loading setup: batchSize: ${batchSize}, limit left: ${limit - offset} total limit: ${limit}, offset: ${offset}`);
    const currentLimit = limit < batchSize + offset ? limit - offset : batchSize;
    console.log(`Loading next batch of ${currentLimit} items`);
    const newItems = await Apify.client.datasets.getItems({
        datasetId,
        offset,
        limit: currentLimit,
    }).then((res) => res.items);

    console.log(`loaded ${newItems.length} items`);

    callback(checker, newItems, badItems, badFields, identificationFields);
    if (offset + batchSize >= limit) {
        console.log('All items loaded');
        return;
    }
    await Apify.setValue('STATE', { offset, badItems, badFields });
    await loadResults(options, offset + batchSize);
}

const iterationFn = (checker, items, badItems, badFields, identificationFields, offset = 0) => {
    items.forEach((item, index) => {
        try {
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
                const debugItem = getOutputItem(item, itemBadFields, identificationFields, index + offset);
                badItems.push(debugItem); // COPY_MODE ? deepcopy(debugItem) : debugItem
            }
        } catch (e) {
            console.log('Checker failed on item, please check your javascript:');
            console.dir(item);
            throw new Error('Checker failed with error:', e);
        }
    });
};

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('input');
    console.dir(input);

    const {
        apifyStorageId,
        recordKey,
        rawData,
        functionalChecker,
        identificationFields = [],
        limit,
        offset = 0,
        batchSize = 50000,
        // copyMode = false,
    } = input;

    // COPY_MODE = copyMode;

    if (!apifyStorageId && !rawData) {
        throw new Error('Input should contain at least one of: "apifyStorageId" or "rawData"!');
    }
    if (apifyStorageId && rawData) {
        throw new Error('Input cannot contain both of: "apifyStorageId" or "rawData"!');
    }
    let checker;
    try {
        checker = eval(functionalChecker)();
    } catch (e) {
        throw new Error('Creating checker object from "functionalChecker" failed, please nilcude valid javascript! Error:', e);
    }
    if (typeof checker !== 'object') {
        throw new Error('Input has to contain "checkFunctions" object!');
    }
    Object.entries(checker).forEach(([key, value]) => {
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
            console.log('Total items in dataset:', totalItemCount);
        } else {
            if (!recordKey) {
                throw new Error('Cannot try to load from KV store without a "recordKey" input parameter');
            }
            kvStoreData = await Apify.client.keyValueStores.getRecord({ storeId: apifyStorageId, key: recordKey })
                .then((res) => res.body)
                .catch(() => { throw new Error(`Key-value store with "apifyStorageId": "${apifyStorageId}" and "recordKey": "${recordKey}" was not found, please input correct storage ids`); });
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
        iterationFn(checker, rawData || kvStoreData, badItems, badFields, identificationFields);
    } else if (datasetInfo) {
        await loadResults({
            checker,
            datasetId: apifyStorageId,
            callback: iterationFn,
            batchSize,
            limit,
            badItems,
            badFields,
            identificationFields,
        },
        state ? state.offset : offset);
    }

    console.log(`number of bad items: ${badItems.length}`);
    console.dir(badFields);

    await Apify.setValue('OUTPUT', { totalItemCount, badItemCount: badItems.length, identificationFields, badFields, badItems });
});
