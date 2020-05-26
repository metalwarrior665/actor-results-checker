const { getOutputItem, analyzeCheck } = require('./utils.js');

module.exports = (iterationContext, offset = 0) => {
    const {
        state,
        checker,
        items,
        identificationFields,
        noExtraFields,
        maxBadItemsSaved,
        context,
    } = iterationContext;

    const {
        badItems,
        badFields,
        extraFields,
        fieldCounts,
        badItemsUniqueMarkCount,
    } = state;

    items.forEach((item, index) => {
        try {
            const itemBadFields = [];
            const itemExtraFields = [];
            Object.keys(checker).forEach((key) => {
                const { checkIsFunction, checkIsObject, checkIsSuccessRateObject, checkIsNestedObject } = analyzeCheck(checker[key]);
                if (
                    // Checker value can be a direct check function
                    checkIsFunction
                    ||
                    // Or an object that  can have check function and minimal success rate directly
                    checkIsSuccessRateObject
                ) {
                    const fn = checkIsFunction ? checker[key] : checker[key].check;
                    const isGood = fn(item[key], item, context);
                    if (!isGood) {
                        itemBadFields.push(key);
                        if (!badFields[key]) badFields[key] = 0;
                        badFields[key]++;
                    }
                } else { // == checkIsNestedObject
                    // Or it can have more check objects, each with its check function and optional minimal success rate
                    const keyBadFields = {};
                    for (const [checkName, checkObj] of Object.entries(checker[key])) {
                        const fn = checkObj.check;
                        const isGood = fn(item[key], item, context);
                        if (!isGood) {
                            keyBadFields[checkName] = true;
                        }
                    }
                    if (Object.keys(keyBadFields).length > 0) {
                        // means there were bad checks in this field
                        itemBadFields.push(keyBadFields);
                        if (!badFields[key]) {
                            badFields[key] = {};
                        }
                        for (const keyBadField of Object.keys(keyBadFields)) {
                            if (!badFields[key][keyBadField]) {
                                badFields[key][keyBadField] = 0;
                            }
                            badFields[key][keyBadField]++;
                        }
                    }
                }
            });

            const allowedKeys = Object.keys(checker);
            Object.keys(item).forEach((key) => {
                // Checking extra noise fields
                if (noExtraFields) {
                    if (!allowedKeys.includes(key)) {
                        itemExtraFields.push(key);
                        if (!extraFields[key]) extraFields[key] = 0;
                        extraFields[key]++;
                    }
                }
                // We aggregate how many times each field had truthy value
                // Check for falsiness (except 0 which is usually legit value)
                if (!fieldCounts[key]) {
                    fieldCounts[key] = 0;
                }
                if (item[key] || item[key] === 0) {
                    fieldCounts[key]++;
                }
            });

            if (itemBadFields.length > 0 || itemExtraFields > 0) {
                state.badItemCount++;
                // We only push new bad items until we reach maxBadItemsSaved for the particular badFields
                const badItemUniqueMark = itemBadFields.concat(itemExtraFields).reduce((acc, val) => acc.concat(val), '');
                if (!badItemsUniqueMarkCount[badItemUniqueMark]) {
                    badItemsUniqueMarkCount[badItemUniqueMark] = 0;
                }
                if (badItemsUniqueMarkCount[badItemUniqueMark] < maxBadItemsSaved) {
                    const debugItem = getOutputItem(item, itemBadFields, itemExtraFields, identificationFields, index + offset);
                    badItems.push(debugItem);
                }
                badItemsUniqueMarkCount[badItemUniqueMark]++;
            }
        } catch (e) {
            console.log('Checker failed on item, please check your javascript:');
            console.dir(item);
            throw new Error(`Checker failed with error: ${e}`);
        }
    });
};
