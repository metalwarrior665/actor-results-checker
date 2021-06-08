const Apify = require('apify');

const iterationFn = require('./iteration-fn.js');
const loadAndProcessResults = require('./loader.js');
const { analyzeCheck } = require('./utils.js');

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

    let storage = apifyStorageId;
    if (!apifyStorageId && input.resource && input.resource.defaultDatasetId) {
        console.log('INPUT - Automatically extractig dataset ID from webhook')
        storage = input.resource.defaultDatasetId;
    }

    if (!storage && !rawData) {
        throw new Error('Input should contain at least one of: "apifyStorageId" or "rawData"!');
    }
    if (storage && rawData) {
        throw new Error('Input cannot contain both of: "apifyStorageId" or "rawData"!');
    }
    let checker;
    try {
        checker = eval(functionalChecker)({ context });
    } catch (e) {
        throw new Error('Creating checker object from "functionalChecker" failed, please nilcude valid javascript! Error:', e);
    }
    if (typeof checker !== 'object') {
        throw new Error('Input has to contain "checkFunctions" object!');
    }
    Object.entries(checker).forEach(([key, value]) => {
        if (typeof value !== 'function' && typeof value !== 'object') {
            throw new Error(`Checker on key ${key} is type: ${typeof value}. It has to be a function or object. Please correct the input!`);
        }
        if (typeof value === 'object') {
            if (typeof value.check === 'function' && typeof value.minimalSuccessRate === 'number') {
                // all good here
            } else {
                Object.values(value).forEach((checkObj, i) => {
                    if (typeof checkObj !== 'object') {
                        throw new Error(`Check object on key ${key} and index ${i} is type: ${typeof checkObj}. It has to be an object. Please correct the input!`);
                    }
                    if (typeof checkObj.check !== 'function') {
                        throw new Error(`Check object check on key ${key} and index ${i} is type: ${typeof checkObj.check}. It has to be a function. Please correct the input!`);
                    }
                })
            }
        }
    });

    const defaultState = {
        badItemCount: 0, // We cannot compute that from badItems length because we trim that array to save memory
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
    if (storage) {
        datasetInfo = await Apify.newClient().dataset(storage).getDataset()
            .catch((e) => console.log('Dataset with "apifyStorageId" was not found, we will try kvStore', e));
        if (datasetInfo) {
            totalItemCount = datasetInfo.itemCount;
            console.log('Total items in dataset:', totalItemCount);
        } else {
            console.log('dataset not found, will try KV store');
            if (!recordKey) {
                throw new Error('Cannot try to load from KV store without a "recordKey" input parameter');
            }
            kvStoreData = await Apify.newClient().keyValueStore(storage).getRecord(ecordKey)
                .then((res) => res.body)
                .catch(() => { throw new Error(`Key-value store with "apifyStorageId": "${storage}" and "recordKey": "${recordKey}" was not found, please input correct storage ids`); });
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
            datasetId: storage,
            batchSize,
            limit: limit || totalItemCount,
            iterationContext,
        });
    }

    await Apify.setValue('STATE', state);

    console.log('Bad fields before applying success rate:');
    console.dir(state.badFields);
    // To cut of any references
    state.badFieldsRaw = JSON.parse(JSON.stringify(state.badFields));

    let createBadItemsWithoutSucceeded = false;
    // Now we update the bad items and bad fields with the successRate "policy"
    // Success rate is either "global" from minimalSuccessRate input
    // or from functionalChecker in the fields
    // Check iteration-fn.js to understand different possible checker formats
    for (const [badField, badValue] of Object.entries(state.badFields)) {
        const { checkIsFunction, checkIsObject, checkIsSuccessRateObject, checkIsNestedObject } = analyzeCheck(checker[badField]);
        if (
            minimalSuccessRate[badField] && checkIsFunction
            || checkIsObject && checkIsSuccessRateObject
        ) {
            const minSuccessRate = checkIsSuccessRateObject ? checker[badField].minimalSuccessRate : minimalSuccessRate[badField];
            const rateOfSuccess = 1 - badValue / totalItemCount;
            const wasSuccess = rateOfSuccess > minSuccessRate;
            console.log(`${badField} = ${rateOfSuccess}(rateOfSuccess) > ${minSuccessRate}(minimalSuccessRate) => wasSuccess: ${wasSuccess}`)
            if (wasSuccess) {
                createBadItemsWithoutSucceeded = true;
                delete state.badFields[badField];
            }
        } else if (checkIsNestedObject) {
            for (const [checkName, checkObj] of Object.entries(checker[badField])) {
                if (!checkObj.minimalSuccessRate) {
                    continue;
                }
                const rateOfSuccess = 1 - badValue[checkName] / totalItemCount;
                const wasSuccess = rateOfSuccess > checkObj.minimalSuccessRate;
                console.log(`${badField}.${checkName} = ${rateOfSuccess}(rateOfSuccess) > ${checkObj.minimalSuccessRate}(minimalSuccessRate) => wasSuccess: ${wasSuccess}`)
                if (wasSuccess) {
                    createBadItemsWithoutSucceeded = true;
                    delete state.badFields[badField][checkName];
                }
            }
            if (Object.keys(state.badFields[badField]).length === 0) {
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
        badItemCount: state.badItemCount,
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
