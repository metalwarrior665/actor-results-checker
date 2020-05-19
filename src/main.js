const Apify = require('apify');

const iterationFn = require('./iteration-fn.js');
const loadAndProcessResults = require('./loader.js');

// I know this code is convoluted, refactor would be nice
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
        minimalSuccessRate = {},
        limit,
        offset = 0,
        batchSize = 50000,
        maxBadItemsSaved = 20,
        context, // Can be anything
    } = input;

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

    const defaultState = {
        badItems: [],
        badFields: {},
        extraFields: {},
        fieldCounts: {},
        badItemsUniqueMarkCount: {},
        offset, // for pagination of dataset
    };
    const state = (await Apify.getValue('STATE')) || defaultState;

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

    // Values that are same for dataset and other inputs
    const iterationContext = {
        checker,
        state,
        identificationFields,
        noExtraFields,
        maxBadItemsSaved,
        context,
    };

    if (rawData || kvStoreData) {
        iterationFn({ items: rawData || kvStoreData, ...iterationContext });
    } else if (datasetInfo) {
        await loadAndProcessResults({
            datasetId: apifyStorageId,
            batchSize,
            limit: limit || totalItemCount,
            iterationContext,
        });
    }

    await Apify.setValue('STATE', state);

    console.log('Bad fields before applying success rate:');
    console.dir(state.badFields);

    let createBadItemsWithoutSucceeded = false;
    // Now we update the bad items and bad fields with the successRate "policy"
    for (const [badField, badValue] of Object.entries(state.badFields)) {
        if (minimalSuccessRate[badField]) {
            const rateOfSuccess = 1 - badValue / totalItemCount;
            const wasSuccess = rateOfSuccess > minimalSuccessRate[badField];
            console.log(`${badField} = ${rateOfSuccess}(rateOfSuccess) > ${minimalSuccessRate[badField]}(minimalSuccessRate) => wasSuccess: ${wasSuccess}`)
            if (wasSuccess) {
                createBadItemsWithoutSucceeded = true;
                delete state.badFields[badField];
            }
        }
    }

    console.log('Bad fields after applying success rate:');
    console.dir(state.badFields);

    console.log('Total fields count:');
    console.log(state.fieldCounts);

    console.log('Saving OUTPUT');
    await Apify.setValue('OUTPUT', {
        totalItemCount,
        badItemCount: state.badItems.length,
        identificationFields,
        badFields: state.badFields,
        extraFields: state.extraFields,
        totalFieldCounts: state.fieldCounts,
        badItems: `https://api.apify.com/v2/key-value-stores/${Apify.getEnv().defaultKeyValueStoreId}/records/BAD-ITEMS?disableRedirect=true`,
        badItemsWithoutSucceeded: createBadItemsWithoutSucceeded
            ? `https://api.apify.com/v2/key-value-stores/${Apify.getEnv().defaultKeyValueStoreId}/records/BAD-ITEMS-WITHOUT-SUCCEEDED?disableRedirect=true`
            : undefined,
    });
    console.log('OUTPUT saved...');

    if (createBadItemsWithoutSucceeded) {
        // If the item has any badFields that was not removed from badFields, we have to keep it
        const badItemsWithoutSucceeded = state.badItems.filter((item) => {
            for (const itemBadField of item.badFields) {
                if (state.badFields[itemBadField]) {
                    return true;
                }
            }
            return false;
        });
        console.log('Saving BAD-ITEMS-WITHOUT-SUCCEEDED');
        await Apify.setValue('BAD-ITEMS-WITHOUT-SUCCEEDED', badItemsWithoutSucceeded);
        console.log('BAD-ITEMS-WITHOUT-SUCCEEDED saved...');
    }

    console.log('Saving BAD-ITEMS');
    await Apify.setValue('BAD-ITEMS', state.badItems);
    console.log('BAD-ITEMS saved...');
});
