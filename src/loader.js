const Apify = require('apify');

const iterationFn = require('./iteration-fn.js');

module.exports = async (options) => {
    const { datasetId, batchSize, limit, iterationContext } = options;
    const { state } = iterationContext;

    while (true) {
        console.log(`loading setup: batchSize: ${batchSize}, limit left: ${limit - state.offset} total limit: ${limit}, offset: ${state.offset}`);
        const currentLimit = limit < batchSize + state.offset ? limit - state.offset : batchSize;
        console.log(`Loading next batch of ${currentLimit} items`);
        const newItems = await Apify.newClient().dataset(datasetId).getItems({
            offset: state.offset,
            limit: currentLimit,
            clean: true,
        }).then((res) => res.items);

        console.log(`loaded ${newItems.length} items`);

        iterationFn({ items: newItems, ...iterationContext }, state.offset);
        const { badFields, fieldCounts, badItems } = state;
        console.dir({ badItemCount: state.badItemCount, badFields, fieldCounts });
        if (state.offset + batchSize >= limit || newItems.length === 0) {
            console.log('All items loaded');
            return;
        }
        state.offset += batchSize;
        await Apify.setValue('STATE', state);
    }
}
