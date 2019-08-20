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

module.exports.getOutputItem = getOutputItem;
