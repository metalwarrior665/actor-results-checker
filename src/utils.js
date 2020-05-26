const trimFields = (item, identificationFields) => {
    if (identificationFields.length === 0) {
        return item;
    }
    return identificationFields.reduce((newItem, field) => {
        newItem[field] = item[field];
        return newItem;
    }, {});
};

const getOutputItem = (item, badFields, extraFields, identificationFields, index) => {
    const trimmedItem = trimFields(item, identificationFields);
    const updatedItem = badFields.concat(extraFields).reduce((updItem, field) => {
        updItem[field] = item[field];
        return updItem;
    }, trimmedItem);
    return {
        data: updatedItem,
        badFields: badFields.length > 0 ? badFields : undefined,
        extraFields: extraFields.length > 0 ? extraFields : undefined,
        itemIndex: index,
    };
};

module.exports.getOutputItem = getOutputItem;

module.exports.analyzeCheck = (check) => {
    const checkIsFunction = typeof check === 'function';
    const checkIsObject = typeof check === 'object';
    const checkIsSuccessRateObject = typeof check.check === 'function' && typeof check.minimalSuccessRate === 'number';
    const checkIsNestedObject = checkIsObject && !checkIsSuccessRateObject;
    return { checkIsFunction, checkIsObject, checkIsSuccessRateObject, checkIsNestedObject };
};
