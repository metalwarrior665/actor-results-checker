const Apify = require('apify');

const iterationFn = require('./iteration-fn.js');

module.exports = async (options) => {
    const { datasetId, batchSize, limit, iterationContext } = options;
    const { state } = iterationContext;
    const { offset } = state;

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

        iterationFn({ items: newItems, ...iterationContext }, offset);
        const { badFields, fieldCounts, badItems } = state;
        console.dir({ badItemCount: badItems.length, badFields, fieldCounts });
        if (offset + batchSize >= limit || newItems.length === 0) {
            console.log('All items loaded');
            return;
        }
        state.offset += batchSize;
        await Apify.setValue('STATE', { state });
    }
}
