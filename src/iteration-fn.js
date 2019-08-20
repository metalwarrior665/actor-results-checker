const { getOutputItem } = require('./utils.js');

module.exports = ({ checker, items, badItems, badFields, identificationFields, noExtraFields }, offset = 0) => {
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
            if (noExtraFields) {
                const allowedKeys = Object.keys(checker);
                Object.keys(item).forEach((key) => {
                    if (!allowedKeys.includes(key)) {
                        itemBadFields.push(key);
                        if (!badFields[key]) badFields[key] = 0;
                        badFields[key]++;
                    }
                });
            }
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
