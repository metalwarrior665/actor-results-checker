const { getOutputItem } = require('./utils.js');

module.exports = ({ checker, items, badItems, badFields, fieldCounts, identificationFields, noExtraFields }, offset = 0) => {
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

            const allowedKeys = Object.keys(checker);
            Object.keys(item).forEach((key) => {
                // Checking extra noise fields
                if (noExtraFields) {
                    if (!allowedKeys.includes(key)) {
                        itemBadFields.push(key);
                        if (!badFields[key]) badFields[key] = 0;
                        badFields[key]++;
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
