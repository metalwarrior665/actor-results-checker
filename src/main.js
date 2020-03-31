const Apify = require('apify');
// const deepcopy = require('deepcopy');

// let COPY_MODE;

const iterationFn = require('./iteration-fn.js');

async function loadAndProcessResults(options, offset) {
    const { checker, datasetId, batchSize, limit, badItems, badFields, fieldCounts, extraFields, identificationFields, noExtraFields, context } = options;

    while (true) {
        console.log(`loading setup: batchSize: ${batchSize}, limit left: ${limit - offset} total limit: ${limit}, offset: ${offset}`);
        const currentLimit = limit < batchSize + offset ? limit - offset : batchSize;
        console.log(`Loading next batch of ${currentLimit} items`);
        const newItems = await Apify.client.datasets.getItems({
            datasetId,
            offset,
            limit: currentLimit,
        }).then((res) => res.items);

        console.log(`loaded ${newItems.length} items`);

        iterationFn({ checker, items: newItems, badItems, badFields, fieldCounts, extraFields, identificationFields, noExtraFields, context }, offset);
        console.dir({ badItemCount: badItems.length, badFields, fieldCounts });
        if (offset + batchSize >= limit || newItems.length === 0) {
            console.log('All items loaded');
            return;
        }
        await Apify.setValue('STATE', { offset, badItems, badFields, extraFields, fieldCounts });
        offset += batchSize;
    }
    // await loadResults(options, offset + batchSize);
}

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
        noExtraFields = true,
        limit,
        offset = 0,
        batchSize = 50000,
        context, // Can be anything
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
    const extraFields = state ? state.extraFields : {};
    const fieldCounts = state ? state.fieldCounts : {};

    let datasetInfo;
    let kvStoreData;
    let totalItemCount;
    if (apifyStorageId) {
        datasetInfo = await Apify.client.datasets.getDataset({ datasetId: apifyStorageId })
            .catch((e) => console.log('Dataset with "apifyStorageId" was not found, we will try kvStore', e));
        if (datasetInfo) {
            totalItemCount = datasetInfo.itemCount;
            console.log('Total items in dataset:', totalItemCount);
        } else {
            console.log('dataset not found, will try KV store');
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
        iterationFn({ checker, items: rawData || kvStoreData, badItems, badFields, fieldCounts, extraFields, identificationFields, noExtraFields, context });
    } else if (datasetInfo) {
        await loadAndProcessResults({
            checker,
            datasetId: apifyStorageId,
            batchSize,
            limit: limit || totalItemCount,
            badItems,
            fieldCounts,
            badFields,
            extraFields,
            identificationFields,
            noExtraFields,
            context,
        },
        state ? state.offset : offset);
    }

    console.log(`number of bad items: ${badItems.length}`);

    console.log('Bad fields:');
    console.dir(badFields);

    console.log('Total fields count:');
    console.log(fieldCounts);


    await Apify.setValue('OUTPUT', {
        totalItemCount,
        badItemCount: badItems.length,
        identificationFields,
        badFields,
        extraFields,
        totalFieldCounts: fieldCounts,
        badItems: `https://api.apify.com/v2/key-value-stores/${Apify.getEnv().defaultKeyValueStoreId}/records/BAD-ITEMS?disableRedirect=true`,
    });

    await Apify.setValue('BAD-ITEMS', badItems);
});
